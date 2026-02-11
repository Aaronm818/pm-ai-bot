import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CallAutomationClient,
  CallConnection,
  CallMedia,
  DtmfTone,
  StartMediaStreamingOptions,
  StopMediaStreamingOptions,
  TextSource,
} from '@azure/communication-call-automation';
import {
  CommunicationIdentifier,
  PhoneNumberIdentifier,
  isCommunicationUserIdentifier,
  isPhoneNumberIdentifier,
  isMicrosoftTeamsUserIdentifier,
  isUnknownIdentifier,
} from '@azure/communication-common';
import {
  CallSession,
  AcsIncomingCallEventData,
  DtmfToneConfig,
  DEFAULT_DTMF_CONFIG,
  DEFAULT_MEDIA_STREAMING_CONFIG,
  AudioStreamingSession,
  TextToSpeechConfig,
  DEFAULT_TTS_CONFIG,
} from './call-events.types';
import { WebSocketService } from '../websocket/websocket.service';
import axios from 'axios';

@Injectable()
export class CallAutomationService {
  private readonly logger = new Logger(CallAutomationService.name);
  private callAutomationClient: CallAutomationClient;
  private activeCalls: Map<string, CallSession> = new Map();
  private callConnections: Map<string, CallConnection> = new Map();
  private audioStreamingSessions: Map<string, AudioStreamingSession> =
    new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly webSocketService: WebSocketService,
  ) {
    const connectionString = this.configService.get<string>(
      'ACS_CONNECTION_STRING',
    );

    if (!connectionString) {
      throw new Error('ACS_CONNECTION_STRING is required');
    }

    this.callAutomationClient = new CallAutomationClient(connectionString);

    this.logger.log('Call Automation Service initialized');
  }

  async handleIncomingCall(eventData: AcsIncomingCallEventData): Promise<void> {
    this.logger.log(`Incoming call: ${eventData.serverCallId}`);

    const callSession: CallSession = {
      callConnectionId: eventData.callConnectionId,
      serverCallId: eventData.serverCallId,
      correlationId: eventData.correlationId,
      incomingCallContext: eventData.incomingCallContext,
      state: 'incoming',
      startTime: new Date(),
      participants: [],
      from: eventData.from,
      to: eventData.to,
    };

    this.activeCalls.set(eventData.serverCallId, callSession);

    try {
      await this.answerCall(
        eventData.incomingCallContext,
        eventData.serverCallId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to answer call ${eventData.callConnectionId}:`,
        error,
      );
      this.updateCallState(eventData.callConnectionId, 'disconnected');
    }
  }

  private async answerCall(
    incomingCallContext: string,
    serverCallId: string,
  ): Promise<void> {
    try {
      this.logger.log(`Answering call: ${serverCallId}`);

      const baseUrl = this.configService.get<string>(
        'BASE_URL',
        'http://localhost:3000',
      );

      // Create media streaming configuration for answer call
      const mediaStreamingConfig = this.createMediaStreamingConfig(baseUrl, serverCallId);

      // Answer call with media streaming options configured
      const answerCallResult = await this.callAutomationClient.answerCall(
        incomingCallContext,
        `${baseUrl}/acs/events`,
        {
          mediaStreamingOptions: mediaStreamingConfig
        },
      );

      const callConnection = answerCallResult.callConnection;
      this.callConnections.set(serverCallId, callConnection);

      // Initialize audio streaming session
      const audioSession: AudioStreamingSession = {
        serverCallId,
        callConnectionId:
          answerCallResult.callConnectionProperties.callConnectionId,
        isStreaming: false,
      };
      this.audioStreamingSessions.set(serverCallId, audioSession);

      this.logger.log(`Call answered successfully: ${serverCallId}`);
      this.updateCallState(serverCallId, 'answered');

      // Wait 3.5 seconds then send audio tone
      setTimeout(async () => {
        await this.sendAudioTone(serverCallId, DEFAULT_DTMF_CONFIG);

        // Wait additional 1 second after sending audio tone, then start audio streaming
        setTimeout(async () => {
          await this.startAudioStreaming(serverCallId);
        }, DEFAULT_MEDIA_STREAMING_CONFIG.startDelayMs);
      }, DEFAULT_TTS_CONFIG.waitTimeMs);
    } catch (error) {
      this.logger.error(`Failed to answer call ${serverCallId}:`, error);
      throw error;
    }
  } // Send DTMF tone to the call
  async sendAudioTone(
    serverCallId: string,
    dtmfConfig: DtmfToneConfig = DEFAULT_DTMF_CONFIG,
  ): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const callSession = this.activeCalls.get(serverCallId);

    if (!callConnection) {
      this.logger.warn(`Call connection not found for ${serverCallId}`);
      return;
    }

    if (!callSession || !callSession.from) {
      this.logger.warn(
        `Call session or caller information not found for ${serverCallId}`,
      );
      return;
    }

    // Log the actual structure of the from identifier for debugging
    this.logger.log(
      'DEBUG: callSession.from structure:',
      JSON.stringify(callSession.from, null, 2),
    );

    try {
      this.logger.log(
        `Sending DTMF tone "${dtmfConfig.tone}" to call ${serverCallId}`,
      );

      const callMedia: CallMedia = callConnection.getCallMedia();

      // Convert string tone to DtmfTone enum
      const dtmfTone = this.stringToDtmfTone(dtmfConfig.tone);

      // Send DTMF tone to the caller
      try {
        // Prepare the target identifier for DTMF sending
        const targetIdentifier = this.prepareDtmfTarget(callSession.from);
        if (!targetIdentifier) {
          throw new Error(
            `Unsupported communication identifier type for DTMF: ${JSON.stringify(callSession.from)}`,
          );
        }

        await callMedia.sendDtmfTones([dtmfTone], targetIdentifier);
      } catch (dtmfError) {
        this.logger.error(
          `Failed to send DTMF tone "${dtmfConfig.tone}" to call ${serverCallId}:`,
          dtmfError,
        );
        // Log more details about the identifier for debugging
        this.logger.error(
          'Identifier details:',
          JSON.stringify(callSession.from, null, 2),
        );
        throw dtmfError;
      }

      this.logger.log(
        `DTMF tone "${dtmfConfig.tone}" sent successfully to call ${serverCallId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send DTMF tone to call ${serverCallId}:`,
        error,
      );
    }
  }

  // Send text-to-speech audio to the call using OpenAI TTS API and WebSocket
  async sendTextToSpeech(
    serverCallId: string,
    ttsConfig: TextToSpeechConfig = DEFAULT_TTS_CONFIG,
  ): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const callSession = this.activeCalls.get(serverCallId);

    if (!callConnection) {
      this.logger.warn(`Call connection not found for ${serverCallId}`);
      return;
    }

    if (!callSession) {
      this.logger.warn(`Call session not found for ${serverCallId}`);
      return;
    }

    try {
      this.logger.log(
        `Generating text-to-speech using OpenAI for call ${serverCallId}: "${ttsConfig.text}"`,
      );

      // Get OpenAI API key from environment
      const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      const openaiTtsEndpoint = this.configService.get<string>(
        'OPENAI_TTS_ENDPOINT',
      );
      if (!openaiTtsEndpoint) {
        throw new Error('OPENAI_TTS_ENDPOINT is not configured');
      }

      // Call OpenAI TTS API
      const ttsResponse = await axios.post(
        openaiTtsEndpoint,
        {
          model: "gpt-4o-mini-tts",
          input: ttsConfig.text,
          voice: this.mapVoiceToOpenAI(ttsConfig.voice || 'en-US-JennyNeural'),
          response_format: 'wav', // Use WAV format for better compatibility
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer', // Get binary data
        },
      );

      // Convert binary audio data to base64
      const audioBuffer = Buffer.from(ttsResponse.data);
      const audioBase64 = audioBuffer.toString('base64');

      this.logger.log(
        `Generated audio from OpenAI TTS, size: ${audioBuffer.length} bytes`,
      );

      // Send audio through WebSocket to the call
      const success = this.webSocketService.sendAudioToAcsClient(
        serverCallId,
        audioBase64,
      );

      if (success) {
        this.logger.log(
          `Text-to-speech audio sent successfully via WebSocket to call ${serverCallId}`,
        );
      } else {
        this.logger.warn(
          `Failed to send audio via WebSocket - no active connection for ${serverCallId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate or send text-to-speech to call ${serverCallId}:`,
        error,
      );
      throw error;
    }
  }

  // Map Azure TTS voice names to OpenAI TTS voices
  private mapVoiceToOpenAI(azureVoice: string): string {
    const voiceMap: { [key: string]: string } = {
      'en-US-JennyNeural': 'alloy',
      'en-US-GuyNeural': 'echo',
      'en-US-AriaNeural': 'fable',
      'en-US-DavisNeural': 'onyx',
      'en-US-AmberNeural': 'nova',
      'en-US-AnaNeural': 'shimmer',
      'en-GB-SoniaNeural': 'alloy',
      'en-GB-RyanNeural': 'echo',
      'en-AU-NatashaNeural': 'fable',
      'en-AU-WilliamNeural': 'onyx',
      'fr-FR-DeniseNeural': 'nova',
      'fr-FR-HenriNeural': 'echo',
      'de-DE-KatjaNeural': 'shimmer',
      'de-DE-ConradNeural': 'onyx',
      'es-ES-ElviraNeural': 'nova',
      'es-ES-AlvaroNeural': 'echo',
      'it-IT-ElsaNeural': 'alloy',
      'it-IT-DiegoNeural': 'onyx',
      'pt-BR-FranciscaNeural': 'fable',
      'pt-BR-AntonioNeural': 'echo',
      'ja-JP-NanamiNeural': 'shimmer',
      'ja-JP-KeitaNeural': 'onyx',
      'ko-KR-SunHiNeural': 'nova',
      'ko-KR-InJoonNeural': 'echo',
      'zh-CN-XiaoxiaoNeural': 'alloy',
      'zh-CN-YunyangNeural': 'onyx',
    };

    return voiceMap[azureVoice] || 'alloy'; // Default to 'alloy' if not found
  }

  // Convert string to DtmfTone enum
  private stringToDtmfTone(tone: string): DtmfTone {
    switch (tone) {
      case '0':
        return DtmfTone.Zero;
      case '1':
        return DtmfTone.One;
      case '2':
        return DtmfTone.Two;
      case '3':
        return DtmfTone.Three;
      case '4':
        return DtmfTone.Four;
      case '5':
        return DtmfTone.Five;
      case '6':
        return DtmfTone.Six;
      case '7':
        return DtmfTone.Seven;
      case '8':
        return DtmfTone.Eight;
      case '9':
        return DtmfTone.Nine;
      case '*':
        return DtmfTone.Asterisk;
      case '#':
        return DtmfTone.Pound;
      case 'A':
        return DtmfTone.A;
      case 'B':
        return DtmfTone.B;
      case 'C':
        return DtmfTone.C;
      case 'D':
        return DtmfTone.D;
      default:
        this.logger.warn(`Unknown DTMF tone: ${tone}, defaulting to tone "1"`);
        return DtmfTone.One;
    }
  }

  // Prepare communication identifier for DTMF target
  private prepareDtmfTarget(
    identifier: CommunicationIdentifier,
  ): CommunicationIdentifier | null {
    this.logger.log(
      'Preparing DTMF target from identifier:',
      JSON.stringify(identifier, null, 2),
    );

    // Check the type of identifier and prepare accordingly
    if (isPhoneNumberIdentifier(identifier)) {
      // Return the phone number identifier as-is
      this.logger.log('Identifier is PhoneNumberIdentifier');
      return identifier;
    } else if (isCommunicationUserIdentifier(identifier)) {
      // Return the communication user identifier as-is
      this.logger.log('Identifier is CommunicationUserIdentifier');
      return identifier;
    } else if (isMicrosoftTeamsUserIdentifier(identifier)) {
      // Return the Teams user identifier as-is
      this.logger.log('Identifier is MicrosoftTeamsUserIdentifier');
      return identifier;
    } else if (isUnknownIdentifier(identifier)) {
      this.logger.warn(
        'Received unknown identifier type for DTMF target:',
        identifier,
      );
      // Try to return as-is, let the SDK handle it
      return identifier;
    } else {
      // Handle the specific structure we're receiving from the incoming call event
      if (identifier && typeof identifier === 'object') {
        const anyIdentifier = identifier as any;

        // Handle the kind-based identifier structure
        if (anyIdentifier.kind === 'phoneNumber' && anyIdentifier.phoneNumber) {
          this.logger.log('Converting kind-based phoneNumber identifier');
          // Create a proper PhoneNumberIdentifier from the received structure
          const phoneIdentifier: PhoneNumberIdentifier = {
            phoneNumber:
              anyIdentifier.phoneNumber.value || anyIdentifier.phoneNumber,
          };
          this.logger.log(
            'Created PhoneNumberIdentifier:',
            JSON.stringify(phoneIdentifier, null, 2),
          );
          return phoneIdentifier;
        }

        // Handle legacy structure with direct phoneNumber property
        if (
          anyIdentifier.phoneNumber &&
          typeof anyIdentifier.phoneNumber === 'string'
        ) {
          return {
            phoneNumber: anyIdentifier.phoneNumber,
          } as PhoneNumberIdentifier;
        }

        // Handle structure with nested phoneNumber.value
        if (
          anyIdentifier.phoneNumber &&
          anyIdentifier.phoneNumber.value &&
          typeof anyIdentifier.phoneNumber.value === 'string'
        ) {
          return {
            phoneNumber: anyIdentifier.phoneNumber.value,
          } as PhoneNumberIdentifier;
        }

        // If it has id property, create a CommunicationUserIdentifier
        if (anyIdentifier.id && typeof anyIdentifier.id === 'string') {
          return { communicationUserId: anyIdentifier.id };
        }
      }

      this.logger.error(
        'Unable to prepare DTMF target from identifier:',
        identifier,
      );
      return null;
    }
  }

  // Handle call connected event
  async handleCallConnected(callConnectionId: string): Promise<void> {
    this.logger.log(`Call connected: ${callConnectionId}`);
    this.updateCallState(callConnectionId, 'connected');
  }

  // Handle call disconnected event
  async handleCallDisconnected(callConnectionId: string): Promise<void> {
    this.logger.log(`Call disconnected: ${callConnectionId}`);
    this.updateCallState(callConnectionId, 'disconnected');

    // Cleanup
    this.activeCalls.delete(callConnectionId);
    this.callConnections.delete(callConnectionId);
  }

  // Update call state
  private updateCallState(
    serverCallId: string,
    state: CallSession['state'],
  ): void {
    const callSession = this.activeCalls.get(serverCallId);
    if (callSession) {
      callSession.state = state;
      if (state === 'disconnected') {
        callSession.endTime = new Date();
      }
    }
  }

  // Reject a call
  async rejectCall(incomingCallContext: string): Promise<void> {
    try {
      await this.callAutomationClient.rejectCall(incomingCallContext);
      this.logger.log('Call rejected successfully');
    } catch (error) {
      this.logger.error('Failed to reject call:', error);
      throw error;
    }
  }

  // Hang up a call
  async hangUpCall(serverCallId: string): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    if (!callConnection) {
      this.logger.warn(`Call connection not found for ${serverCallId}`);
      return;
    }

    try {
      await callConnection.hangUp(true); // Terminate for everyone
      this.logger.log(`Call hung up: ${serverCallId}`);
    } catch (error) {
      this.logger.error(`Failed to hang up call ${serverCallId}:`, error);
      throw error;
    }
  }

  // Get active calls
  getActiveCalls(): CallSession[] {
    return Array.from(this.activeCalls.values());
  }

  // Get call session by ID
  getCallSession(serverCallId: string): CallSession | undefined {
    return this.activeCalls.get(serverCallId);
  }

  // Get call statistics
  getCallStats() {
    const activeCalls = this.getActiveCalls();
    return {
      totalActiveCalls: activeCalls.length,
      callsByState: {
        incoming: activeCalls.filter((c) => c.state === 'incoming').length,
        answered: activeCalls.filter((c) => c.state === 'answered').length,
        connected: activeCalls.filter((c) => c.state === 'connected').length,
        disconnected: activeCalls.filter((c) => c.state === 'disconnected')
          .length,
      },
      activeCalls: activeCalls.map((call) => ({
        callConnectionId: call.callConnectionId,
        state: call.state,
        startTime: call.startTime,
        duration: call.endTime
          ? call.endTime.getTime() - call.startTime.getTime()
          : Date.now() - call.startTime.getTime(),
      })),
    };
  }

  // Create media streaming configuration
  private createMediaStreamingConfig(baseUrl: string, serverCallId: string): any {
    // Create websocket URL for audio streaming
    const wsUrl = baseUrl.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:');
    const audioStreamingUrl = `${wsUrl}/ws?serverCallId=${serverCallId}`;

    const config = {
      transportUrl: audioStreamingUrl,
      transportType: 'websocket',
      contentType: 'audio',
      audioChannelType: 'unmixed',
      enableBidirectional: DEFAULT_MEDIA_STREAMING_CONFIG.enableBidirectional,
      audioFormat: 'Pcm24KMono', // Use Pcm24KMono for better quality
      startMediaStreaming: false, // We'll start streaming manually after DTMF
    };

    this.logger.log(`Created media streaming config:`, {
      transportUrl: config.transportUrl,
      audioFormat: config.audioFormat,
      audioChannelType: config.audioChannelType,
    });

    return config;
  }

  // Start audio streaming for a call
  async startAudioStreaming(serverCallId: string): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const audioSession = this.audioStreamingSessions.get(serverCallId);

    if (!callConnection) {
      this.logger.warn(`Call connection not found for ${serverCallId}`);
      return;
    }

    if (!audioSession) {
      this.logger.warn(`Audio streaming session not found for ${serverCallId}`);
      return;
    }

    if (audioSession.isStreaming) {
      this.logger.log(`Audio streaming already active for ${serverCallId}`);
      return;
    }

    try {
      this.logger.log(`Starting audio streaming for call ${serverCallId}`);

      const callMedia: CallMedia = callConnection.getCallMedia();

      // Start media streaming using the correct API signature
      const startOptions: StartMediaStreamingOptions = {
        operationContext: `startMediaStreaming_${serverCallId}`,
      };

      await callMedia.startMediaStreaming(startOptions);

      // Update streaming session state
      audioSession.isStreaming = true;
      audioSession.startTime = new Date();
      audioSession.recordingPath = `recordings/${serverCallId}.wav`;

      this.logger.log(
        `Audio streaming started successfully for call ${serverCallId}`,
        {
          operationContext: startOptions.operationContext,
          recordingPath: audioSession.recordingPath,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to start audio streaming for call ${serverCallId}:`,
        error,
      );
      // Don't throw error, as call should continue even if streaming fails
    }
  }

  // Stop audio streaming for a call
  async stopAudioStreaming(serverCallId: string): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const audioSession = this.audioStreamingSessions.get(serverCallId);

    if (!callConnection || !audioSession || !audioSession.isStreaming) {
      return;
    }

    try {
      this.logger.log(`Stopping audio streaming for call ${serverCallId}`);

      const callMedia: CallMedia = callConnection.getCallMedia();

      const stopOptions: StopMediaStreamingOptions = {
        operationContext: `stopMediaStreaming_${serverCallId}`,
      };

      await callMedia.stopMediaStreaming(stopOptions);

      // Update session state
      audioSession.isStreaming = false;
      audioSession.endTime = new Date();

      this.logger.log(`Audio streaming stopped for call ${serverCallId}`);
    } catch (error) {
      this.logger.error(
        `Failed to stop audio streaming for call ${serverCallId}:`,
        error,
      );
    }
  }

  // Handle media streaming events
  async handleMediaStreamingStarted(serverCallId: string): Promise<void> {
    const audioSession = this.audioStreamingSessions.get(serverCallId);
    if (audioSession) {
      audioSession.isStreaming = true;
      audioSession.startTime = new Date();
      this.logger.log(
        `Media streaming started confirmed for call ${serverCallId}`,
      );
    }
  }

  async handleMediaStreamingStopped(serverCallId: string): Promise<void> {
    const audioSession = this.audioStreamingSessions.get(serverCallId);
    if (audioSession) {
      audioSession.isStreaming = false;
      audioSession.endTime = new Date();
      this.logger.log(
        `Media streaming stopped confirmed for call ${serverCallId}`,
      );
    }
  }
}
