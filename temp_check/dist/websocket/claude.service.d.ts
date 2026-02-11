import { ConfigService } from '@nestjs/config';
interface ClaudeResponse {
    text: string;
    error?: string;
    document?: {
        type: 'report' | 'email' | 'summary';
        title: string;
        content: string;
    };
    guardrail?: {
        triggered: boolean;
        type: string;
        message: string;
    };
}
interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}
export declare class ClaudeService {
    private readonly configService;
    private readonly logger;
    private conversationHistory;
    private getCachedDataCallback;
    private readonly documentPatterns;
    private readonly guardrailPatterns;
    constructor(configService: ConfigService);
    setCachedDataCallback(callback: () => string): void;
    private checkGuardrails;
    private detectDocumentRequest;
    private extractTopic;
    private generateTitle;
    private capitalize;
    chat(sessionId: string, userMessage: string, visionContext?: string): Promise<ClaudeResponse>;
    private generateDocument;
    private generateVoiceResponse;
    clearHistory(sessionId: string): void;
    getHistory(sessionId: string): ConversationMessage[];
}
export {};
