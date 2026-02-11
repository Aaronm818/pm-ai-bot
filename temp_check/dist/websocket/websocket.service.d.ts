import { WebSocketGateway } from './websocket.gateway';
import { AudioStreamingService } from './audio-streaming.service';
export declare class WebSocketService {
    private readonly webSocketGateway;
    private readonly audioStreamingService;
    private readonly logger;
    constructor(webSocketGateway: WebSocketGateway, audioStreamingService: AudioStreamingService);
    getConnectedAcsClients(): string[];
    getAcsClientCount(): number;
    getAudioSessionStats(): {
        clientId: string;
        connected: boolean;
    }[];
    sendAudioToAcsClient(clientId: string, audioData: string): boolean;
    stopAudioForAcsClient(clientId: string): boolean;
    getAcsStreamingStats(): {
        connectedAcsClients: number;
        connectedClientIds: string[];
        audioSessions: {
            clientId: string;
            connected: boolean;
        }[];
        timestamp: string;
    };
    broadcastToAllClients(eventType: string, data: any): void;
    broadcastAudioData(audioData: any): void;
    getSessionStats(): {
        totalSessions: number;
        activeSessions: number;
        sessions: {
            sessionId: string;
            participantId: string;
            subscriptionId: string;
            startTime: Date;
            lastActivity: Date;
            duration: number;
            sampleRate: number;
            encoding: "PCM";
        }[];
    };
    performCleanup(): void;
}
