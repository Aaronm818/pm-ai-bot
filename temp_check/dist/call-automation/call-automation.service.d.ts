import { ConfigService } from '@nestjs/config';
import { CallSession, AcsIncomingCallEventData, DtmfToneConfig, TextToSpeechConfig } from './call-events.types';
import { WebSocketService } from '../websocket/websocket.service';
export declare class CallAutomationService {
    private readonly configService;
    private readonly webSocketService;
    private readonly logger;
    private callAutomationClient;
    private activeCalls;
    private callConnections;
    private audioStreamingSessions;
    private acsEndpoint;
    private acsAccessKey;
    constructor(configService: ConfigService, webSocketService: WebSocketService);
    handleIncomingCall(eventData: AcsIncomingCallEventData): Promise<void>;
    private answerCall;
    sendAudioTone(serverCallId: string, dtmfConfig?: DtmfToneConfig): Promise<void>;
    sendTextToSpeech(serverCallId: string, ttsConfig?: TextToSpeechConfig): Promise<void>;
    private mapVoiceToOpenAI;
    private stringToDtmfTone;
    private prepareDtmfTarget;
    handleCallConnected(callConnectionId: string): Promise<void>;
    handleCallDisconnected(callConnectionId: string): Promise<void>;
    private updateCallState;
    rejectCall(incomingCallContext: string): Promise<void>;
    hangUpCall(serverCallId: string): Promise<void>;
    getActiveCalls(): CallSession[];
    getCallSession(serverCallId: string): CallSession | undefined;
    getCallStats(): {
        totalActiveCalls: number;
        callsByState: {
            incoming: number;
            answered: number;
            connected: number;
            disconnected: number;
        };
        activeCalls: {
            callConnectionId: string;
            state: "connected" | "disconnected" | "incoming" | "answered";
            startTime: Date;
            duration: number;
        }[];
    };
    private createMediaStreamingConfig;
    startAudioStreaming(serverCallId: string): Promise<void>;
    stopAudioStreaming(serverCallId: string): Promise<void>;
    handleMediaStreamingStarted(serverCallId: string): Promise<void>;
    handleMediaStreamingStopped(serverCallId: string): Promise<void>;
    private generateAcsAuthHeader;
    joinTeamsMeeting(teamsLink: string, displayName?: string): Promise<{
        success: boolean;
        callConnectionId?: string;
        serverCallId?: string;
        error?: string;
    }>;
}
