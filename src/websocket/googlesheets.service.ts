import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

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

@Injectable()
export class GoogleSheetsService implements OnModuleInit {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: sheets_v4.Sheets;
  private cachedRows: SheetRow[] = [];
  private lastSync: Date | null = null;
  private isConfigured = false;
  private sheetId: string;

  constructor(private configService: ConfigService) {
    this.sheetId = this.configService.get<string>('GOOGLE_SHEET_ID') || '';
  }

  async onModuleInit() {
    await this.initialize();
  }

  private async initialize() {
    try {
      const clientEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      const privateKey = this.configService.get<string>('GOOGLE_PRIVATE_KEY');
      
      this.logger.log(`🔍 Google Sheets config check:`);
      this.logger.log(`   - Client Email: ${clientEmail ? clientEmail.substring(0, 20) + '...' : 'NOT SET'}`);
      this.logger.log(`   - Private Key: ${privateKey ? 'SET (' + privateKey.length + ' chars)' : 'NOT SET'}`);
      this.logger.log(`   - Sheet ID: ${this.sheetId || 'NOT SET'}`);
      
      if (!clientEmail || !privateKey || !this.sheetId) {
        this.logger.warn('⚠️ Google Sheets NOT configured - missing credentials or sheet ID');
        this.logger.warn('   Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID in .env');
        return;
      }

      // Process the private key - handle both escaped and unescaped newlines
      let processedKey = privateKey;
      // If the key is wrapped in quotes, remove them
      if (processedKey.startsWith('"') && processedKey.endsWith('"')) {
        processedKey = processedKey.slice(1, -1);
      }
      // Replace escaped newlines with actual newlines
      processedKey = processedKey.replace(/\\n/g, '\n');
      
      this.logger.log(`   - Processed Key starts with: ${processedKey.substring(0, 30)}...`);
      this.logger.log(`   - Processed Key ends with: ...${processedKey.substring(processedKey.length - 30)}`);

      // Create JWT auth client
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: processedKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      // Test the auth by getting a token
      this.logger.log('🔐 Testing Google auth...');
      try {
        const token = await auth.getAccessToken();
        this.logger.log(`✅ Auth successful! Token obtained: ${token.token?.substring(0, 20)}...`);
      } catch (authError) {
        this.logger.error(`❌ Auth failed: ${authError.message}`);
        return;
      }

      // Create sheets client
      this.sheets = google.sheets({ version: 'v4', auth });
      this.isConfigured = true;

      this.logger.log('✅ Google Sheets service initialized');
      this.logger.log(`   Sheet ID: ${this.sheetId.substring(0, 20)}...`);

      // Initial fetch
      await this.refreshCache();

      // Auto-refresh every 30 seconds
      setInterval(() => this.refreshCache(), 30000);

    } catch (error) {
      this.logger.error('Failed to initialize Google Sheets:', error.message);
      this.logger.error('Full error:', error);
    }
  }

  async refreshCache(): Promise<void> {
    if (!this.isConfigured || !this.sheets) {
      return;
    }

    try {
      // Try direct fetch without metadata call first
      const range = 'Sheet1!A:N';
      this.logger.log(`📗 Fetching range: ${range}`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        this.logger.warn('No data found in Google Sheet');
        this.cachedRows = [];
        return;
      }

      this.logger.log(`📗 Got ${rows.length} rows from Google Sheets`);

      // Skip header row (first row)
      const dataRows = rows.slice(1);
      
      this.cachedRows = dataRows.map((row) => ({
        caseId: row[0] || '',
        caseTitle: row[1] || '',
        priority: row[2] || '',
        status: row[3] || '',
        project: row[4] || '',
        requester: row[5] || '',
        ownerPM: row[6] || '',
        createdDate: row[7] || '',
        dueDate: row[8] || '',
        slaDays: parseInt(row[9]) || 0,
        riskLevel: row[10] || '',
        description: row[11] || '',
        nextAction: row[12] || '',
      }));

      this.lastSync = new Date();
      this.logger.log(`🔄 Google Sheets cache refreshed: ${this.cachedRows.length} rows`);

    } catch (error) {
      this.logger.error('Failed to fetch Google Sheets data:');
      this.logger.error(error.message);
      
      // Log full error details
      if (error.response) {
        this.logger.error(`   Status: ${error.response?.status}`);
        this.logger.error(`   Data: ${JSON.stringify(error.response?.data)}`);
      }
      if (error.code) {
        this.logger.error(`   Error code: ${error.code}`);
      }
      if (error.errors) {
        this.logger.error(`   Errors: ${JSON.stringify(error.errors)}`);
      }
      
      // Log the full error stack
      this.logger.error(`   Full error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        this.logger.error('   Sheet ID may be incorrect or sheet was deleted');
        this.logger.error(`   Current Sheet ID: ${this.sheetId}`);
      }
      if (error.message?.includes('403')) {
        this.logger.error('   Make sure the sheet is shared with the service account email');
      }
    }
  }

  /**
   * Get cached rows
   */
  getCachedRows(): { rows: SheetRow[]; count: number } {
    return {
      rows: this.cachedRows,
      count: this.cachedRows.length,
    };
  }

  /**
   * Get summary for PM Bot context injection
   */
  getCachedRowsSummary(): string {
    if (this.cachedRows.length === 0) {
      return 'No Google Sheets data available.';
    }

    const summary = this.cachedRows.map((row, index) => {
      return `${index + 1}. [${row.caseId}] ${row.caseTitle}
   - Status: ${row.status} | Priority: ${row.priority} | Risk: ${row.riskLevel}
   - Project: ${row.project} | Owner: ${row.ownerPM}
   - Due: ${row.dueDate} | SLA Days: ${row.slaDays}
   - Next Action: ${row.nextAction}`;
    }).join('\n\n');

    return `=== GOOGLE SHEETS DATA (${this.cachedRows.length} cases) ===\n\n${summary}`;
  }

  /**
   * Get connection status for frontend
   */
  getConnectionStatus(): {
    connected: boolean;
    records: number;
    lastSync: string | null;
    sheetId: string;
    sheetName: string;
  } {
    return {
      connected: this.isConfigured && this.cachedRows.length > 0,
      records: this.cachedRows.length,
      lastSync: this.lastSync?.toISOString() || null,
      sheetId: this.sheetId ? `${this.sheetId.substring(0, 10)}...` : '',
      sheetName: 'Project Manager Data',
    };
  }

  /**
   * Check if service is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Filter rows by status
   */
  getRowsByStatus(status: string): SheetRow[] {
    return this.cachedRows.filter(
      (row) => row.status.toLowerCase() === status.toLowerCase()
    );
  }

  /**
   * Filter rows by priority
   */
  getRowsByPriority(priority: string): SheetRow[] {
    return this.cachedRows.filter(
      (row) => row.priority.toLowerCase() === priority.toLowerCase()
    );
  }

  /**
   * Get high risk items
   */
  getHighRiskItems(): SheetRow[] {
    return this.cachedRows.filter(
      (row) => row.riskLevel.toLowerCase() === 'high'
    );
  }

  /**
   * Get items due soon (within 7 days)
   */
  getItemsDueSoon(): SheetRow[] {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    return this.cachedRows.filter((row) => {
      if (!row.dueDate) return false;
      const dueDate = new Date(row.dueDate);
      return dueDate >= now && dueDate <= weekFromNow;
    });
  }
}
