import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

@Injectable()
export class DataverseService implements OnModuleInit {
  private readonly logger = new Logger(DataverseService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private workingTableName: string | null = 'cr48f_aitaskses'; // Pre-set to known working table
  
  // === CACHING ===
  private cachedTasks: DataverseTask[] = [];
  private cacheLastUpdated: Date | null = null;
  private cacheRefreshInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_REFRESH_MS = 30000; // 30 seconds

  constructor(private readonly configService: ConfigService) {
    this.logger.log('Dataverse Service initialized with caching');
  }

  /**
   * Auto-fetch data when module starts
   */
  async onModuleInit() {
    this.logger.log('🚀 Pre-fetching Dataverse data...');
    await this.refreshCache();
    
    // Set up auto-refresh every 30 seconds
    this.cacheRefreshInterval = setInterval(() => {
      this.refreshCache();
    }, this.CACHE_REFRESH_MS);
    
    this.logger.log(`✅ Dataverse cache initialized with ${this.cachedTasks.length} tasks (auto-refresh every ${this.CACHE_REFRESH_MS/1000}s)`);
  }

  /**
   * Refresh the cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const result = await this.fetchTasksFromDataverse();
      if (!result.error) {
        this.cachedTasks = result.tasks;
        this.cacheLastUpdated = new Date();
        this.logger.log(`🔄 Cache refreshed: ${this.cachedTasks.length} tasks`);
      }
    } catch (error) {
      this.logger.error(`Cache refresh failed: ${error.message}`);
    }
  }

  /**
   * Get cached tasks (instant - no API call!)
   */
  getCachedTasks(): DataverseQueryResult {
    return {
      tasks: this.cachedTasks,
      count: this.cachedTasks.length,
    };
  }

  /**
   * Get tasks summary for injecting into Claude's context
   */
  getCachedTasksSummary(): string {
    if (this.cachedTasks.length === 0) {
      return "No cases currently in the system.";
    }

    let summary = `Current cases (${this.cachedTasks.length} total):\n`;
    this.cachedTasks.forEach((task, index) => {
      summary += `${index + 1}. ${task.name}${task.requirements ? ' - ' + task.requirements : ''} [${task.status}]\n`;
    });
    
    return summary;
  }

  /**
   * Check if cache is available
   */
  hasCachedData(): boolean {
    return this.cachedTasks.length > 0;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tenantId = this.configService.get<string>('DATAVERSE_TENANT_ID');
    const clientId = this.configService.get<string>('DATAVERSE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('DATAVERSE_CLIENT_SECRET');
    const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');

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

  /**
   * Get tasks - uses cache for speed, falls back to API if needed
   */
  async getTasks(): Promise<DataverseQueryResult> {
    // Use cached data if available (instant!)
    if (this.hasCachedData()) {
      this.logger.log(`⚡ Using cached data (${this.cachedTasks.length} tasks)`);
      return this.getCachedTasks();
    }
    
    // Fallback to API call if cache is empty
    this.logger.log('📊 Cache empty, fetching from Dataverse...');
    return this.fetchTasksFromDataverse();
  }

  /**
   * Fetch tasks directly from Dataverse API (used for cache refresh)
   */
  private async fetchTasksFromDataverse(): Promise<DataverseQueryResult> {
    try {
      const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');
      const token = await this.getAccessToken();

      // Try multiple possible table names - KNOWN WORKING TABLE FIRST!
      const tableNamesToTry = [
        'cr48f_aitaskses',    // ✅ Known working table - try this first!
        'cr48f_aitasks',      // Plural from URL
        'cr48f_aitask',       // Singular
        'cra5f_aitasks',      // Different prefix
        'cra5f_aitask',
        'cr95d_aitasks',      // Another common prefix
        'cr95d_aitask',
        'mscrmcommunity_aitasks',
        'new_aitasks',
        'new_aitask',
      ];

      // If we found a working table before, try it first
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
            
            // Log field names from first record
            if (data.value?.[0]) {
              this.logger.log(`📊 Fields: ${Object.keys(data.value[0]).join(', ')}`);
            }

            // Map records
            const tasks: DataverseTask[] = (data.value || []).map((record: any, index: number) => {
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
          } else {
            this.logger.log(`❌ ${tableName}: ${response.status}`);
          }
        } catch (e) {
          this.logger.log(`❌ ${tableName}: ${e.message}`);
        }
      }

      return { tasks: [], count: 0, error: 'Could not find AI Tasks table. Check table name in Power Apps > Advanced > Tools.' };
    } catch (error) {
      this.logger.error(`Failed: ${error.message}`);
      return { tasks: [], count: 0, error: error.message };
    }
  }

  async getTasksSummary(): Promise<string> {
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
}
