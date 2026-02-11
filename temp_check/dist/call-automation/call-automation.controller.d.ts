import { CallAutomationService } from './call-automation.service';
import { WebSocketService } from '../websocket/websocket.service';
import { EventGridEvent, SubscriptionValidationResponse } from './call-events.types';
export declare class CallAutomationController {
    private readonly callAutomationService;
    private readonly webSocketService;
    private readonly logger;
    private readonly identityClient;
    constructor(callAutomationService: CallAutomationService, webSocketService: WebSocketService);
    getToken(): Promise<{
        token: string;
        expiresOn: Date;
        userId: string;
    }>;
    handleEventGridEvents(events: EventGridEvent[]): Promise<SubscriptionValidationResponse | {
        message: string;
    }>;
    private handleSubscriptionValidation;
    private processEvent;
    private handleIncomingCall;
    private handleCallConnected;
    private handleCallDisconnected;
    private handleParticipantsUpdated;
    private handleMediaStreamingStarted;
    private handleMediaStreamingStopped;
    private handleDtmfReceived;
    private handlePlayCompleted;
    private handleRecordingFileStatusUpdated;
    sendTestTone(callConnectionId: string, body: {
        tone?: string;
        waitTimeMs?: number;
    }): Promise<{
        message: string;
        toneConfig: {
            tone: string;
            waitTimeMs: number;
        };
    }>;
    sendTestTextToSpeech(callConnectionId: string, body: {
        text?: string;
        voice?: string;
        language?: string;
        waitTimeMs?: number;
    }): Promise<{
        message: string;
        ttsConfig: {
            text: string;
            voice: string;
            language: string;
            waitTimeMs: number;
        };
    }>;
    hangUpCall(callConnectionId: string): Promise<{
        message: string;
    }>;
}
