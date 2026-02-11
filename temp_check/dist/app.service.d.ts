import { WebSocketService } from './websocket/websocket.service';
import { CallAutomationService } from './call-automation/call-automation.service';
export declare class AppService {
    private readonly webSocketService;
    private readonly callAutomationService;
    constructor(webSocketService: WebSocketService, callAutomationService: CallAutomationService);
    getAcsStreamingStats(): {
        connectedAcsClients: number;
        connectedClientIds: string[];
        audioSessions: {
            clientId: string;
            connected: boolean;
        }[];
        timestamp: string;
    };
    sendAudioToAcsClient(clientId: string, audioData: string): boolean;
    stopAudioForAcsClient(clientId: string): boolean;
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
    getActiveCalls(): import("./call-automation/call-events.types").CallSession[];
    sendToneToCall(serverCallId: string, tone?: string, waitTimeMs?: number): Promise<void>;
    hangUpCall(serverCallId: string): Promise<void>;
    sendTextToSpeechToCall(serverCallId: string, text?: string, voice?: string, language?: string, waitTimeMs?: number): Promise<void>;
    joinTeamsMeeting(teamsLink: string, displayName?: string): Promise<{
        success: boolean;
        callConnectionId?: string;
        serverCallId?: string;
        error?: string;
    }>;
}
