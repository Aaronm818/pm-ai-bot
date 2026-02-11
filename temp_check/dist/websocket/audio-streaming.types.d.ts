export interface AudioMetadata {
    subscriptionId: string;
    encoding: 'PCM';
    sampleRate: number;
    channels: number;
    length: number;
}
export interface AudioData {
    timestamp: string;
    participantRawID: string;
    data: string;
    silent: boolean;
}
export interface AcsStreamingMessage {
    kind: 'AudioMetadata' | 'AudioData';
    audioMetadata?: AudioMetadata;
    audioData?: AudioData;
}
export interface OutboundAudioData {
    Kind: 'AudioData';
    AudioData: {
        Data: string;
    };
    StopAudio: null;
}
export interface StopAudioMessage {
    Kind: 'StopAudio';
    AudioData: null;
    StopAudio: Record<string, never>;
}
export interface ErrorMessage {
    Kind: 'Error';
    AudioData: null;
    StopAudio: null;
    Error: {
        message: string;
    };
}
export type OutboundMessage = OutboundAudioData | StopAudioMessage | ErrorMessage;
export interface AudioSession {
    sessionId: string;
    participantId?: string;
    subscriptionId?: string;
    metadata?: AudioMetadata;
    isActive: boolean;
    startTime: Date;
    lastActivity: Date;
}
export interface AudioProcessingResult {
    processedData?: string;
    shouldStop?: boolean;
    error?: string;
}
