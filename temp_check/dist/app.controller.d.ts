import { StreamableFile } from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getAcsStreamingStats(): {
        connectedAcsClients: number;
        connectedClientIds: string[];
        audioSessions: {
            clientId: string;
            connected: boolean;
        }[];
        timestamp: string;
    };
    sendAudioToClient(clientId: string, body: {
        audioData: string;
    }): {
        success: boolean;
        message: string;
    };
    stopAudioForClient(clientId: string): {
        success: boolean;
        message: string;
    };
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
    sendToneToCall(callConnectionId: string, body: {
        tone?: string;
        waitTimeMs?: number;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    sendTextToSpeechToCall(callConnectionId: string, body: {
        text?: string;
        voice?: string;
        language?: string;
        waitTimeMs?: number;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    hangUpCall(callConnectionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    joinTeamsMeeting(body: {
        teamsLink: string;
        displayName?: string;
    }): Promise<{
        success: boolean;
        callConnectionId?: string;
        serverCallId?: string;
        error?: string;
    }>;
    getRecordings(): {
        recordings: {
            name: string;
            path: string;
            size: number;
            created: Date;
            modified: Date;
        }[];
        error?: undefined;
    } | {
        recordings: any[];
        error: any;
    };
    getRecordingFile(filename: string, res: Response): StreamableFile | {
        error: string;
    };
}
