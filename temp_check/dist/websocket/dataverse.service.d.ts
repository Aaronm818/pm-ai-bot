import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
interface DataverseTask {
    taskid: string;
    name: string;
    requirements?: string;
    status: string;
}
interface DataverseQueryResult {
    tasks: DataverseTask[];
    count: number;
    error?: string;
}
export declare class DataverseService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private accessToken;
    private tokenExpiry;
    private workingTableName;
    private cachedTasks;
    private cacheLastUpdated;
    private cacheRefreshInterval;
    private readonly CACHE_REFRESH_MS;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    private refreshCache;
    getCachedTasks(): DataverseQueryResult;
    getCachedTasksSummary(): string;
    hasCachedData(): boolean;
    private getAccessToken;
    getTasks(): Promise<DataverseQueryResult>;
    private fetchTasksFromDataverse;
    getTasksSummary(): Promise<string>;
}
export {};
