import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
  HttpCode,
  Param,
  Get,
} from '@nestjs/common';
import { CallAutomationService } from './call-automation.service';
import { WebSocketService } from '../websocket/websocket.service';
import { CommunicationIdentityClient } from '@azure/communication-identity';
import {
  EventGridEvent,
  ACS_EVENT_TYPES,
  EVENTGRID_EVENT_TYPES,
  AcsIncomingCallEventData,
  AcsCallConnectedEventData,
  AcsCallDisconnectedEventData,
  AcsCallParticipantEventData,
  AcsMediaStreamingStartedEventData,
  AcsMediaStreamingStoppedEventData,
  AcsDtmfReceivedEventData,
  AcsPlayCompletedEventData,
  AcsRecordingFileStatusUpdatedEventData,
  SubscriptionValidationEventData,
  SubscriptionValidationResponse,
} from './call-events.types';

@Controller('acs')
export class CallAutomationController {
  private readonly logger = new Logger(CallAutomationController.name);
  private readonly identityClient: CommunicationIdentityClient;

  constructor(
    private readonly callAutomationService: CallAutomationService,
    private readonly webSocketService: WebSocketService,
  ) {
    // Initialize identity client for generating tokens
    const connectionString = process.env.ACS_CONNECTION_STRING;
    if (!connectionString) {
      this.logger.error('ACS_CONNECTION_STRING not set - token endpoint will fail');
    }
    this.identityClient = new CommunicationIdentityClient(connectionString || '');
  }

  /**
   * Generate ACS token for browser clients to join Teams meetings
   * GET /acs/token
   */
  @Get('token')
  async getToken() {
    this.logger.log('Generating ACS token for browser client');
    
    try {
      // Create a new user and get token with VOIP scope
      const user = await this.identityClient.createUser();
      const tokenResponse = await this.identityClient.getToken(user, ['voip']);
      
      this.logger.log(`Token generated for user: ${user.communicationUserId}`);
      
      return {
        token: tokenResponse.token,
        expiresOn: tokenResponse.expiresOn,
        userId: user.communicationUserId,
      };
    } catch (error) {
      this.logger.error('Failed to generate ACS token:', error);
      throw new BadRequestException('Failed to generate token');
    }
  }

  @Post('events')
  @HttpCode(200)
  async handleEventGridEvents(
    @Body() events: EventGridEvent[],
  ): Promise<SubscriptionValidationResponse | { message: string }> {
    this.logger.log(`Received ${events.length} EventGrid event(s)`);

    const validationEvent = events.find(
      (event) =>
        event.eventType === EVENTGRID_EVENT_TYPES.SUBSCRIPTION_VALIDATION ||
        (event as any).type === EVENTGRID_EVENT_TYPES.SUBSCRIPTION_VALIDATION,
    );
    if (validationEvent) {
      return this.handleSubscriptionValidation(validationEvent);
    }

    for (const event of events) {
      try {
        await this.processEvent(event);
      } catch (error) {
        this.logger.error(`Failed to process event ${event.id}:`, error);
      }
    }

    return { message: `Processed ${events.length} events` };
  }

  private handleSubscriptionValidation(
    event: EventGridEvent,
  ): SubscriptionValidationResponse {
    this.logger.log('EventGrid subscription validation');

    const validationData = event.data as SubscriptionValidationEventData;

    if (!validationData.validationCode) {
      throw new BadRequestException('Validation code missing');
    }

    return {
      validationResponse: validationData.validationCode,
    };
  }

  private async processEvent(event: EventGridEvent): Promise<void> {
    const eventType = event.eventType || (event as any).type;

    if (!eventType) {
      this.logger.warn('Event received with missing eventType');
      return;
    }

    switch (eventType) {
      case ACS_EVENT_TYPES.INCOMING_CALL:
        await this.handleIncomingCall(event.data as AcsIncomingCallEventData);
        break;

      case ACS_EVENT_TYPES.CALL_CONNECTED:
        await this.handleCallConnected(event.data as AcsCallConnectedEventData);
        break;

      case ACS_EVENT_TYPES.CALL_DISCONNECTED:
        await this.handleCallDisconnected(
          event.data as AcsCallDisconnectedEventData,
        );
        break;

      case ACS_EVENT_TYPES.PARTICIPANTS_UPDATED:
        await this.handleParticipantsUpdated(
          event.data as AcsCallParticipantEventData,
        );
        break;

      case ACS_EVENT_TYPES.MEDIA_STREAMING_STARTED:
        await this.handleMediaStreamingStarted(
          event.data as AcsMediaStreamingStartedEventData,
        );
        break;

      case ACS_EVENT_TYPES.MEDIA_STREAMING_STOPPED:
        await this.handleMediaStreamingStopped(
          event.data as AcsMediaStreamingStoppedEventData,
        );
        break;

      case ACS_EVENT_TYPES.DTMF_RECEIVED:
        await this.handleDtmfReceived(event.data as AcsDtmfReceivedEventData);
        break;

      case ACS_EVENT_TYPES.PLAY_COMPLETED:
        await this.handlePlayCompleted(event.data as AcsPlayCompletedEventData);
        break;

      case ACS_EVENT_TYPES.RECORDING_FILE_STATUS_UPDATED:
        await this.handleRecordingFileStatusUpdated(
          event.data as AcsRecordingFileStatusUpdatedEventData,
        );
        break;

      // Additional ACS events that might be received
      case ACS_EVENT_TYPES.PLAY_STARTED:
      case ACS_EVENT_TYPES.PLAY_FAILED:
      case ACS_EVENT_TYPES.PLAY_CANCELED:
      case ACS_EVENT_TYPES.RECOGNIZE_COMPLETED:
      case ACS_EVENT_TYPES.RECOGNIZE_FAILED:
      case ACS_EVENT_TYPES.RECOGNIZE_CANCELED:
      case ACS_EVENT_TYPES.CONTINUOUS_DTMF_RECOGNITION_TONE_RECEIVED:
      case ACS_EVENT_TYPES.CONTINUOUS_DTMF_RECOGNITION_TONE_FAILED:
      case ACS_EVENT_TYPES.CONTINUOUS_DTMF_RECOGNITION_STOPPED:
      case ACS_EVENT_TYPES.SEND_DTMF_TONES_COMPLETED:
      case ACS_EVENT_TYPES.SEND_DTMF_TONES_FAILED:
      case ACS_EVENT_TYPES.ADD_PARTICIPANT_SUCCEEDED:
      case ACS_EVENT_TYPES.ADD_PARTICIPANT_FAILED:
      case ACS_EVENT_TYPES.REMOVE_PARTICIPANT_SUCCEEDED:
      case ACS_EVENT_TYPES.REMOVE_PARTICIPANT_FAILED:
      case ACS_EVENT_TYPES.CALL_TRANSFER_ACCEPTED:
      case ACS_EVENT_TYPES.CALL_TRANSFER_FAILED:
      case ACS_EVENT_TYPES.RECORDING_STATE_CHANGED:
        this.logger.log(`📋 ACS EVENT: ${event.eventType}`, {
          eventType: event.eventType,
          callConnectionId: event.data?.callConnectionId,
          serverCallId: event.data?.serverCallId,
          correlationId: event.data?.correlationId,
          data: event.data,
        });
        break;

      default:
        this.logger.warn(`Unknown ACS event type: "${eventType}"`);
        break;
    }
  }

  private async handleIncomingCall(
    eventData: AcsIncomingCallEventData,
  ): Promise<void> {
    this.logger.log(`Incoming call: ${eventData.serverCallId}`);
    await this.callAutomationService.handleIncomingCall(eventData);
  }

  private async handleCallConnected(
    eventData: AcsCallConnectedEventData,
  ): Promise<void> {
    this.logger.log(`Call connected: ${eventData.serverCallId}`);
    await this.callAutomationService.handleCallConnected(
      eventData.callConnectionId,
    );
  }

  private async handleCallDisconnected(
    eventData: AcsCallDisconnectedEventData,
  ): Promise<void> {
    this.logger.log(`Call disconnected: ${eventData.serverCallId}`);
    await this.callAutomationService.handleCallDisconnected(
      eventData.serverCallId,
    );
  }

  private async handleParticipantsUpdated(
    eventData: AcsCallParticipantEventData,
  ): Promise<void> {
    this.logger.log(
      `Participants updated: ${eventData.participants.length} participants`,
    );
  }

  private async handleMediaStreamingStarted(
    eventData: AcsMediaStreamingStartedEventData,
  ): Promise<void> {
    this.logger.log(`Media streaming started: ${eventData.serverCallId}`);
  }

  private async handleMediaStreamingStopped(
    eventData: AcsMediaStreamingStoppedEventData,
  ): Promise<void> {
    this.logger.log(`Media streaming stopped: ${eventData.serverCallId}`);
  }

  private async handleDtmfReceived(
    eventData: AcsDtmfReceivedEventData,
  ): Promise<void> {
    this.logger.log(`DTMF received: ${eventData.toneInfo.tone}`);
  }

  private async handlePlayCompleted(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _eventData: AcsPlayCompletedEventData,
  ): Promise<void> {
    this.logger.log('Audio playback completed');
  }

  private async handleRecordingFileStatusUpdated(
    eventData: AcsRecordingFileStatusUpdatedEventData,
  ): Promise<void> {
    this.logger.log(
      `Recording updated: ${eventData.recordingStorageInfo.recordingChunks.length} chunks`,
    );
  }

  // Manual endpoints for testing

  @Post('test/send-tone/:callConnectionId')
  async sendTestTone(
    @Param('callConnectionId') callConnectionId: string,
    @Body() body: { tone?: string; waitTimeMs?: number },
  ) {
    const toneConfig = {
      tone: body.tone || '1',
      waitTimeMs: body.waitTimeMs || 3500,
    };

    await this.callAutomationService.sendAudioTone(
      callConnectionId,
      toneConfig,
    );
    return {
      message: `Sent DTMF tone "${toneConfig.tone}" to call ${callConnectionId}`,
      toneConfig,
    };
  }

  @Post('test/send-tts/:callConnectionId')
  async sendTestTextToSpeech(
    @Param('callConnectionId') callConnectionId: string,
    @Body() body: { text?: string; voice?: string; language?: string; waitTimeMs?: number },
  ) {
    const ttsConfig = {
      text: body.text || 'Hello, this is a test message from Azure Communication Services.',
      voice: body.voice || 'en-US-JennyNeural',
      language: body.language || 'en-US',
      waitTimeMs: body.waitTimeMs || 3500,
    };

    await this.callAutomationService.sendTextToSpeech(
      callConnectionId,
      ttsConfig,
    );
    return {
      message: `Sent text-to-speech to call ${callConnectionId}: "${ttsConfig.text}"`,
      ttsConfig,
    };
  }

  @Post('test/hangup/:callConnectionId')
  async hangUpCall(@Param('callConnectionId') callConnectionId: string) {
    await this.callAutomationService.hangUpCall(callConnectionId);
    return { message: `Hung up call ${callConnectionId}` };
  }
}