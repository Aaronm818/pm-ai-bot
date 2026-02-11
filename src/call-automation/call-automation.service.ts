import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CallAutomationClient,
  CallConnection,
  CallMedia,
  DtmfTone,
  StartMediaStreamingOptions,
  StopMediaStreamingOptions,
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
import * as crypto from 'crypto';

@Injectable()
export class CallAutomationService {
  private readonly logger = new Logger(CallAutomationService.name);
  private callAutomationClient: CallAutomationClient;
  private activeCalls: Map<string, CallSession> = new Map();
  private callConnections: Map<string, CallConnection> = new Map();
  private audioStreamingSessions: Map<string, AudioStreamingSession> = new Map();
  private acsEndpoint: string;
  private acsAccessKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly webSocketService: WebSocketService,
  ) {
    const connectionString = this.configService.get<string>('ACS_CONNECTION_STRING');
    if (!connectionString) {
      throw new Error('ACS_CONNECTION_STRING is required');
    }
    this.callAutomationClient = new CallAutomationClient(connectionString);
    
    const endpointMatch = connectionString.match(/endpoint=([^;]+)/i);
    const accessKeyMatch = connectionString.match(/accesskey=([^;]+)/i);
    this.acsEndpoint = endpointMatch ? endpointMatch[1] : '';
    this.acsAccessKey = accessKeyMatch ? accessKeyMatch[1] : '';
    
    this.logger.log('Call Automation Service initialized');
    this.logger.log(`ACS Endpoint: ${this.acsEndpoint}`);
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
      await this.answerCall(eventData.incomingCallContext, eventData.serverCallId);
    } catch (error) {
      this.logger.error(`Failed to answer call ${eventData.callConnectionId}:`, error);
      this.updateCallState(eventData.callConnectionId, 'disconnected');
    }
  }

  private async answerCall(incomingCallContext: string, serverCallId: string): Promise<void> {
    try {
      this.logger.log(`Answering call: ${serverCallId}`);
      const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');
      const mediaStreamingConfig = this.createMediaStreamingConfig(baseUrl, serverCallId);
      const answerCallResult = await this.callAutomationClient.answerCall(
        incomingCallContext,
        `${baseUrl}/acs/events`,
        { mediaStreamingOptions: mediaStreamingConfig },
      );
      const callConnection = answerCallResult.callConnection;
      this.callConnections.set(serverCallId, callConnection);
      const audioSession: AudioStreamingSession = {
        serverCallId,
        callConnectionId: answerCallResult.callConnectionProperties.callConnectionId,
        isStreaming: false,
      };
      this.audioStreamingSessions.set(serverCallId, audioSession);
      this.logger.log(`Call answered successfully: ${serverCallId}`);
      this.updateCallState(serverCallId, 'answered');
      setTimeout(async () => {
        await this.sendAudioTone(serverCallId, DEFAULT_DTMF_CONFIG);
        setTimeout(async () => {
          await this.startAudioStreaming(serverCallId);
        }, DEFAULT_MEDIA_STREAMING_CONFIG.startDelayMs);
      }, DEFAULT_TTS_CONFIG.waitTimeMs);
    } catch (error) {
      this.logger.error(`Failed to answer call ${serverCallId}:`, error);
      throw error;
    }
  }

  async sendAudioTone(serverCallId: string, dtmfConfig: DtmfToneConfig = DEFAULT_DTMF_CONFIG): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const callSession = this.activeCalls.get(serverCallId);
    if (!callConnection) {
      this.logger.warn(`Call connection not found for ${serverCallId}`);
      return;
    }
    if (!callSession || !callSession.from) {
      this.logger.warn(`Call session or caller information not found for ${serverCallId}`);
      return;
    }
    try {
      this.logger.log(`Sending DTMF tone "${dtmfConfig.tone}" to call ${serverCallId}`);
      const callMedia: CallMedia = callConnection.getCallMedia();
      const dtmfTone = this.stringToDtmfTone(dtmfConfig.tone);
      const targetIdentifier = this.prepareDtmfTarget(callSession.from);
      if (!targetIdentifier) {
        throw new Error(`Unsupported communication identifier type for DTMF`);
      }
      await callMedia.sendDtmfTones([dtmfTone], targetIdentifier);
      this.logger.log(`DTMF tone "${dtmfConfig.tone}" sent successfully to call ${serverCallId}`);
    } catch (error) {
      this.logger.error(`Failed to send DTMF tone to call ${serverCallId}:`, error);
    }
  }

  async sendTextToSpeech(serverCallId: string, ttsConfig: TextToSpeechConfig = DEFAULT_TTS_CONFIG): Promise<void> {
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
      this.logger.log(`Generating text-to-speech for call ${serverCallId}: "${ttsConfig.text}"`);
      const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      const openaiTtsEndpoint = this.configService.get<string>('OPENAI_TTS_ENDPOINT');
      if (!openaiTtsEndpoint) {
        throw new Error('OPENAI_TTS_ENDPOINT is not configured');
      }
      const ttsResponse = await axios.post(
        openaiTtsEndpoint,
        {
          model: "gpt-4o-mini-tts",
          input: ttsConfig.text,
          voice: this.mapVoiceToOpenAI(ttsConfig.voice || 'en-US-JennyNeural'),
          response_format: 'wav',
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        },
      );
      const audioBuffer = Buffer.from(ttsResponse.data);
      const audioBase64 = audioBuffer.toString('base64');
      this.logger.log(`Generated audio from OpenAI TTS, size: ${audioBuffer.length} bytes`);
      const success = this.webSocketService.sendAudioToAcsClient(serverCallId, audioBase64);
      if (success) {
        this.logger.log(`Text-to-speech audio sent successfully via WebSocket to call ${serverCallId}`);
      } else {
        this.logger.warn(`Failed to send audio via WebSocket - no active connection for ${serverCallId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to generate or send text-to-speech to call ${serverCallId}:`, error);
      throw error;
    }
  }

  private mapVoiceToOpenAI(azureVoice: string): string {
    const voiceMap: { [key: string]: string } = {
      'en-US-JennyNeural': 'alloy',
      'en-US-GuyNeural': 'echo',
      'en-US-AriaNeural': 'fable',
      'en-US-DavisNeural': 'onyx',
      'en-US-AmberNeural': 'nova',
      'en-US-AnaNeural': 'shimmer',
    };
    return voiceMap[azureVoice] || 'alloy';
  }

  private stringToDtmfTone(tone: string): DtmfTone {
    switch (tone) {
      case '0': return DtmfTone.Zero;
      case '1': return DtmfTone.One;
      case '2': return DtmfTone.Two;
      case '3': return DtmfTone.Three;
      case '4': return DtmfTone.Four;
      case '5': return DtmfTone.Five;
      case '6': return DtmfTone.Six;
      case '7': return DtmfTone.Seven;
      case '8': return DtmfTone.Eight;
      case '9': return DtmfTone.Nine;
      case '*': return DtmfTone.Asterisk;
      case '#': return DtmfTone.Pound;
      default: return DtmfTone.One;
    }
  }

  private prepareDtmfTarget(identifier: CommunicationIdentifier): CommunicationIdentifier | null {
    if (isPhoneNumberIdentifier(identifier)) return identifier;
    if (isCommunicationUserIdentifier(identifier)) return identifier;
    if (isMicrosoftTeamsUserIdentifier(identifier)) return identifier;
    if (isUnknownIdentifier(identifier)) return identifier;
    if (identifier && typeof identifier === 'object') {
      const anyId = identifier as any;
      if (anyId.kind === 'phoneNumber' && anyId.phoneNumber) {
        return { phoneNumber: anyId.phoneNumber.value || anyId.phoneNumber } as PhoneNumberIdentifier;
      }
      if (anyId.phoneNumber && typeof anyId.phoneNumber === 'string') {
        return { phoneNumber: anyId.phoneNumber } as PhoneNumberIdentifier;
      }
      if (anyId.id && typeof anyId.id === 'string') {
        return { communicationUserId: anyId.id };
      }
    }
    return null;
  }

  async handleCallConnected(callConnectionId: string): Promise<void> {
    this.logger.log(`Call connected: ${callConnectionId}`);
    this.updateCallState(callConnectionId, 'connected');
  }

  async handleCallDisconnected(callConnectionId: string): Promise<void> {
    this.logger.log(`Call disconnected: ${callConnectionId}`);
    this.updateCallState(callConnectionId, 'disconnected');
    this.activeCalls.delete(callConnectionId);
    this.callConnections.delete(callConnectionId);
  }

  private updateCallState(serverCallId: string, state: CallSession['state']): void {
    const callSession = this.activeCalls.get(serverCallId);
    if (callSession) {
      callSession.state = state;
      if (state === 'disconnected') {
        callSession.endTime = new Date();
      }
    }
  }

  async rejectCall(incomingCallContext: string): Promise<void> {
    try {
      await this.callAutomationClient.rejectCall(incomingCallContext);
      this.logger.log('Call rejected successfully');
    } catch (error) {
      this.logger.error('Failed to reject call:', error);
      throw error;
    }
  }

  async hangUpCall(serverCallId: string): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    if (!callConnection) {
      this.logger.warn(`Call connection not found for ${serverCallId}`);
      return;
    }
    try {
      await callConnection.hangUp(true);
      this.logger.log(`Call hung up: ${serverCallId}`);
    } catch (error) {
      this.logger.error(`Failed to hang up call ${serverCallId}:`, error);
      throw error;
    }
  }

  getActiveCalls(): CallSession[] {
    return Array.from(this.activeCalls.values());
  }

  getCallSession(serverCallId: string): CallSession | undefined {
    return this.activeCalls.get(serverCallId);
  }

  getCallStats() {
    const activeCalls = this.getActiveCalls();
    return {
      totalActiveCalls: activeCalls.length,
      callsByState: {
        incoming: activeCalls.filter((c) => c.state === 'incoming').length,
        answered: activeCalls.filter((c) => c.state === 'answered').length,
        connected: activeCalls.filter((c) => c.state === 'connected').length,
        disconnected: activeCalls.filter((c) => c.state === 'disconnected').length,
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

  private createMediaStreamingConfig(baseUrl: string, serverCallId: string): any {
    const wsUrl = baseUrl.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:');
    const audioStreamingUrl = `${wsUrl}/ws?serverCallId=${serverCallId}`;
    return {
      transportUrl: audioStreamingUrl,
      transportType: 'websocket',
      contentType: 'audio',
      audioChannelType: 'unmixed',
      enableBidirectional: DEFAULT_MEDIA_STREAMING_CONFIG.enableBidirectional,
      audioFormat: 'Pcm24KMono',
      startMediaStreaming: false,
    };
  }

  async startAudioStreaming(serverCallId: string): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const audioSession = this.audioStreamingSessions.get(serverCallId);
    if (!callConnection || !audioSession || audioSession.isStreaming) return;
    try {
      this.logger.log(`Starting audio streaming for call ${serverCallId}`);
      const callMedia: CallMedia = callConnection.getCallMedia();
      const startOptions: StartMediaStreamingOptions = {
        operationContext: `startMediaStreaming_${serverCallId}`,
      };
      await callMedia.startMediaStreaming(startOptions);
      audioSession.isStreaming = true;
      audioSession.startTime = new Date();
      this.logger.log(`Audio streaming started successfully for call ${serverCallId}`);
    } catch (error) {
      this.logger.error(`Failed to start audio streaming for call ${serverCallId}:`, error);
    }
  }

  async stopAudioStreaming(serverCallId: string): Promise<void> {
    const callConnection = this.callConnections.get(serverCallId);
    const audioSession = this.audioStreamingSessions.get(serverCallId);
    if (!callConnection || !audioSession || !audioSession.isStreaming) return;
    try {
      this.logger.log(`Stopping audio streaming for call ${serverCallId}`);
      const callMedia: CallMedia = callConnection.getCallMedia();
      const stopOptions: StopMediaStreamingOptions = {
        operationContext: `stopMediaStreaming_${serverCallId}`,
      };
      await callMedia.stopMediaStreaming(stopOptions);
      audioSession.isStreaming = false;
      audioSession.endTime = new Date();
      this.logger.log(`Audio streaming stopped for call ${serverCallId}`);
    } catch (error) {
      this.logger.error(`Failed to stop audio streaming for call ${serverCallId}:`, error);
    }
  }

  async handleMediaStreamingStarted(serverCallId: string): Promise<void> {
    const audioSession = this.audioStreamingSessions.get(serverCallId);
    if (audioSession) {
      audioSession.isStreaming = true;
      audioSession.startTime = new Date();
    }
  }

  async handleMediaStreamingStopped(serverCallId: string): Promise<void> {
    const audioSession = this.audioStreamingSessions.get(serverCallId);
    if (audioSession) {
      audioSession.isStreaming = false;
      audioSession.endTime = new Date();
    }
  }

  private generateAcsAuthHeader(method: string, url: string, body: string): { [key: string]: string } {
    const date = new Date().toUTCString();
    const contentHash = crypto.createHash('sha256').update(body).digest('base64');
    const parsedUrl = new URL(url);
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    const stringToSign = `${method}\n${pathAndQuery}\n${date};${parsedUrl.host};${contentHash}`;
    const signature = crypto.createHmac('sha256', Buffer.from(this.acsAccessKey, 'base64'))
      .update(stringToSign)
      .digest('base64');
    
    return {
      'x-ms-date': date,
      'x-ms-content-sha256': contentHash,
      'Authorization': `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
      'Content-Type': 'application/json',
    };
  }

  async joinTeamsMeeting(teamsLink: string, displayName?: string): Promise<{ success: boolean; callConnectionId?: string; serverCallId?: string; error?: string }> {
    try {
      this.logger.log(`Joining Teams meeting: ${teamsLink}`);
      const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');
      const botDisplayName = displayName || this.configService.get<string>('ACS_DISPLAY_NAME', 'Project Manager AI');
      const serverCallId = `teams-meeting-${Date.now()}`;
      const mediaStreamingConfig = this.createMediaStreamingConfig(baseUrl, serverCallId);

      this.logger.log(`Using display name: ${botDisplayName}`);
      this.logger.log(`Callback URL: ${baseUrl}/acs/events`);

      const callbackUri = `${baseUrl}/acs/events`;
      const apiUrl = `${this.acsEndpoint}calling/callConnections?api-version=2024-09-15`;
      
      const requestBody = {
        callbackUri: callbackUri,
        sourceDisplayName: botDisplayName,
        mediaStreamingConfiguration: {
          transportUrl: mediaStreamingConfig.transportUrl,
          transportType: mediaStreamingConfig.transportType,
          contentType: mediaStreamingConfig.contentType,
          audioChannelType: mediaStreamingConfig.audioChannelType,
        },
        meetingLocator: {
          kind: 'teamsMeetingLink',
          teamsMeetingLink: teamsLink,
        },
      };

      const bodyString = JSON.stringify(requestBody);
      this.logger.log(`Request body: ${bodyString}`);

      const headers = this.generateAcsAuthHeader('POST', apiUrl, bodyString);
      
      const response = await axios.post(apiUrl, requestBody, { headers });

      this.logger.log(`ACS API response:`, response.data);

      const callConnectionId = response.data.callConnectionId;
      
      const callSession: CallSession = {
        callConnectionId: callConnectionId,
        serverCallId: serverCallId,
        correlationId: serverCallId,
        incomingCallContext: teamsLink,
        state: 'answered',
        startTime: new Date(),
        participants: [],
      };
      this.activeCalls.set(serverCallId, callSession);

      const audioSession: AudioStreamingSession = {
        serverCallId,
        callConnectionId: callConnectionId,
        isStreaming: false,
      };
      this.audioStreamingSessions.set(serverCallId, audioSession);

      this.logger.log(`Successfully joined Teams meeting. CallConnectionId: ${callConnectionId}`);
      return { success: true, callConnectionId, serverCallId };
    } catch (error) {
      this.logger.error(`Failed to join Teams meeting:`, error);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      return { success: false, error: error.message || 'Failed to join Teams meeting' };
    }
  }
}