import { AudioMetadata, AudioData, AudioSession, AudioProcessingResult, OutboundAudioData, StopAudioMessage } from './audio-streaming.types';
export declare class AudioStreamingService {
    private readonly logger;
    private audioSessions;
    processAudioMetadata(metadata: AudioMetadata, sessionId: string): AudioSession;
    processAudioData(audioData: AudioData, sessionId: string): Promise<AudioProcessingResult>;
    createOutboundAudioData(audioData: string): OutboundAudioData;
    createStopAudioMessage(): StopAudioMessage;
    getAudioSession(sessionId: string): AudioSession | undefined;
    getActiveSessions(): AudioSession[];
    endAudioSession(sessionId: string): boolean;
    cleanupInactiveSessions(maxInactiveMinutes?: number): number;
    private processAudioBuffer;
    validateAudioMetadata(metadata: AudioMetadata): boolean;
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
}
