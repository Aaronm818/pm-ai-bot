import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface SheetRow {
    caseId: string;
    caseTitle: string;
    priority: string;
    status: string;
    project: string;
    requester: string;
    ownerPM: string;
    createdDate: string;
    dueDate: string;
    slaDays: number;
    riskLevel: string;
    description: string;
    nextAction: string;
}
export declare class GoogleSheetsService implements OnModuleInit {
    private configService;
    private readonly logger;
    private sheets;
    private cachedRows;
    private lastSync;
    private isConfigured;
    private sheetId;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    private initialize;
    refreshCache(): Promise<void>;
    getCachedRows(): {
        rows: SheetRow[];
        count: number;
    };
    getCachedRowsSummary(): string;
    getConnectionStatus(): {
        connected: boolean;
        records: number;
        lastSync: string | null;
        sheetId: string;
        sheetName: string;
    };
    isReady(): boolean;
    getRowsByStatus(status: string): SheetRow[];
    getRowsByPriority(priority: string): SheetRow[];
    getHighRiskItems(): SheetRow[];
    getItemsDueSoon(): SheetRow[];
}
