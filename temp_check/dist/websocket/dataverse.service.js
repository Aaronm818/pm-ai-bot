"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DataverseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataverseService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let DataverseService = DataverseService_1 = class DataverseService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(DataverseService_1.name);
        this.accessToken = null;
        this.tokenExpiry = null;
        this.workingTableName = 'cr48f_aitaskses';
        this.cachedTasks = [];
        this.cacheLastUpdated = null;
        this.cacheRefreshInterval = null;
        this.CACHE_REFRESH_MS = 30000;
        this.logger.log('Dataverse Service initialized with caching');
    }
    async onModuleInit() {
        this.logger.log('🚀 Pre-fetching Dataverse data...');
        await this.refreshCache();
        this.cacheRefreshInterval = setInterval(() => {
            this.refreshCache();
        }, this.CACHE_REFRESH_MS);
        this.logger.log(`✅ Dataverse cache initialized with ${this.cachedTasks.length} tasks (auto-refresh every ${this.CACHE_REFRESH_MS / 1000}s)`);
    }
    async refreshCache() {
        try {
            const result = await this.fetchTasksFromDataverse();
            if (!result.error) {
                this.cachedTasks = result.tasks;
                this.cacheLastUpdated = new Date();
                this.logger.log(`🔄 Cache refreshed: ${this.cachedTasks.length} tasks`);
            }
        }
        catch (error) {
            this.logger.error(`Cache refresh failed: ${error.message}`);
        }
    }
    getCachedTasks() {
        return {
            tasks: this.cachedTasks,
            count: this.cachedTasks.length,
        };
    }
    getCachedTasksSummary() {
        if (this.cachedTasks.length === 0) {
            return "No cases currently in the system.";
        }
        let summary = `Current cases (${this.cachedTasks.length} total):\n`;
        this.cachedTasks.forEach((task, index) => {
            summary += `${index + 1}. ${task.name}${task.requirements ? ' - ' + task.requirements : ''} [${task.status}]\n`;
        });
        return summary;
    }
    hasCachedData() {
        return this.cachedTasks.length > 0;
    }
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }
        const tenantId = this.configService.get('DATAVERSE_TENANT_ID');
        const clientId = this.configService.get('DATAVERSE_CLIENT_ID');
        const clientSecret = this.configService.get('DATAVERSE_CLIENT_SECRET');
        const dataverseUrl = this.configService.get('DATAVERSE_URL');
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('scope', `${dataverseUrl}/.default`);
        params.append('grant_type', 'client_credentials');
        this.logger.log('🔐 Requesting Dataverse access token...');
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (!response.ok) {
            throw new Error(`Failed to get access token: ${response.status}`);
        }
        const data = await response.json();
        this.accessToken = data.access_token;
        this.tokenExpiry = new Date(Date.now() + (data.expires_in - 300) * 1000);
        this.logger.log('🔐 Dataverse access token obtained');
        return this.accessToken;
    }
    async getTasks() {
        if (this.hasCachedData()) {
            this.logger.log(`⚡ Using cached data (${this.cachedTasks.length} tasks)`);
            return this.getCachedTasks();
        }
        this.logger.log('📊 Cache empty, fetching from Dataverse...');
        return this.fetchTasksFromDataverse();
    }
    async fetchTasksFromDataverse() {
        try {
            const dataverseUrl = this.configService.get('DATAVERSE_URL');
            const token = await this.getAccessToken();
            const tableNamesToTry = [
                'cr48f_aitaskses',
                'cr48f_aitasks',
                'cr48f_aitask',
                'cra5f_aitasks',
                'cra5f_aitask',
                'cr95d_aitasks',
                'cr95d_aitask',
                'mscrmcommunity_aitasks',
                'new_aitasks',
                'new_aitask',
            ];
            if (this.workingTableName) {
                tableNamesToTry.unshift(this.workingTableName);
            }
            for (const tableName of tableNamesToTry) {
                const url = `${dataverseUrl}/api/data/v9.2/${tableName}?$top=50`;
                this.logger.log(`📊 Trying table: ${tableName}`);
                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'OData-MaxVersion': '4.0',
                            'OData-Version': '4.0',
                            'Accept': 'application/json',
                            'Prefer': 'odata.include-annotations="*"',
                        },
                    });
                    if (response.ok) {
                        const data = await response.json();
                        this.workingTableName = tableName;
                        this.logger.log(`✅ SUCCESS! Table found: ${tableName}`);
                        if (data.value?.[0]) {
                            this.logger.log(`📊 Fields: ${Object.keys(data.value[0]).join(', ')}`);
                        }
                        const tasks = (data.value || []).map((record, index) => {
                            const keys = Object.keys(record);
                            const nameField = keys.find(k => k.endsWith('_task') || k.endsWith('_name'));
                            const reqField = keys.find(k => k.includes('requirements'));
                            return {
                                taskid: `task-${index}`,
                                name: record[nameField || ''] || `Record ${index + 1}`,
                                requirements: record[reqField || ''] || '',
                                status: record.statecode === 0 ? 'Active' : 'Inactive',
                            };
                        });
                        this.logger.log(`✅ Found ${tasks.length} records`);
                        return { tasks, count: tasks.length };
                    }
                    else {
                        this.logger.log(`❌ ${tableName}: ${response.status}`);
                    }
                }
                catch (e) {
                    this.logger.log(`❌ ${tableName}: ${e.message}`);
                }
            }
            return { tasks: [], count: 0, error: 'Could not find AI Tasks table. Check table name in Power Apps > Advanced > Tools.' };
        }
        catch (error) {
            this.logger.error(`Failed: ${error.message}`);
            return { tasks: [], count: 0, error: error.message };
        }
    }
    async getTasksSummary() {
        const result = await this.getTasks();
        if (result.error) {
            return `I'm sorry, I couldn't retrieve the cases. ${result.error}`;
        }
        if (result.count === 0) {
            return "You don't have any cases at the moment.";
        }
        let summary = `You have ${result.count} case${result.count > 1 ? 's' : ''}. `;
        result.tasks.slice(0, 5).forEach((task, index) => {
            summary += `${index + 1}. ${task.name}. `;
        });
        if (result.count > 5) {
            summary += `And ${result.count - 5} more.`;
        }
        return summary;
    }
};
exports.DataverseService = DataverseService;
exports.DataverseService = DataverseService = DataverseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DataverseService);
//# sourceMappingURL=dataverse.service.js.map