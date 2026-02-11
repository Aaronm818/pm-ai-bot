import { ConfigService } from '@nestjs/config';
export interface SavedFile {
    filename: string;
    filepath: string;
    url: string;
    type: string;
    size: number;
    createdAt: string;
}
export interface ContentAnalysis {
    shouldSave: boolean;
    contentType: 'email' | 'code' | 'document' | 'report' | 'list' | 'general';
    suggestedFilename: string;
    fileExtension: string;
}
export declare class FileOutputService {
    private readonly configService;
    private readonly logger;
    private readonly outputDir;
    private savedFiles;
    constructor(configService: ConfigService);
    private ensureOutputDirectory;
    analyzeContent(userRequest: string, claudeResponse: string): ContentAnalysis;
    private detectCodeExtension;
    private generateFilename;
    saveContent(sessionId: string, content: string, filename: string, extension: string, contentType: string): Promise<SavedFile>;
    private extractCodeFromMarkdown;
    getSessionFiles(sessionId: string): SavedFile[];
    clearSessionFiles(sessionId: string): void;
    getAllFiles(): SavedFile[];
}
