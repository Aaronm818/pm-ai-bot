import { ConfigService } from '@nestjs/config';
interface TTSResult {
    audioBase64: string;
    error?: string;
}
export declare class TTSService {
    private readonly configService;
    private readonly logger;
    private readonly region;
    private readonly subscriptionKey;
    private isConfigured;
    constructor(configService: ConfigService);
    textToSpeech(text: string, voice?: string): Promise<TTSResult>;
    private escapeXml;
    streamTextToSpeech(text: string, voice?: string): AsyncGenerator<string>;
    private splitIntoSentences;
    textToSpeechChunked(text: string, voice: string, onChunk: (audioBase64: string) => void): Promise<void>;
    static getAvailableVoices(): {
        name: string;
        gender: string;
        style: string;
    }[];
    testConfiguration(): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
