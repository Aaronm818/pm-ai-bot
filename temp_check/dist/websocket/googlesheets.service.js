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
var GoogleSheetsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const googleapis_1 = require("googleapis");
let GoogleSheetsService = GoogleSheetsService_1 = class GoogleSheetsService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(GoogleSheetsService_1.name);
        this.cachedRows = [];
        this.lastSync = null;
        this.isConfigured = false;
        this.sheetId = this.configService.get('GOOGLE_SHEET_ID') || '';
    }
    async onModuleInit() {
        await this.initialize();
    }
    async initialize() {
        try {
            const clientEmail = this.configService.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
            const privateKey = this.configService.get('GOOGLE_PRIVATE_KEY');
            this.logger.log(`🔍 Google Sheets config check:`);
            this.logger.log(`   - Client Email: ${clientEmail ? clientEmail.substring(0, 20) + '...' : 'NOT SET'}`);
            this.logger.log(`   - Private Key: ${privateKey ? 'SET (' + privateKey.length + ' chars)' : 'NOT SET'}`);
            this.logger.log(`   - Sheet ID: ${this.sheetId || 'NOT SET'}`);
            if (!clientEmail || !privateKey || !this.sheetId) {
                this.logger.warn('⚠️ Google Sheets NOT configured - missing credentials or sheet ID');
                this.logger.warn('   Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID in .env');
                return;
            }
            let processedKey = privateKey;
            if (processedKey.startsWith('"') && processedKey.endsWith('"')) {
                processedKey = processedKey.slice(1, -1);
            }
            processedKey = processedKey.replace(/\\n/g, '\n');
            this.logger.log(`   - Processed Key starts with: ${processedKey.substring(0, 30)}...`);
            this.logger.log(`   - Processed Key ends with: ...${processedKey.substring(processedKey.length - 30)}`);
            const auth = new googleapis_1.google.auth.JWT({
                email: clientEmail,
                key: processedKey,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            this.logger.log('🔐 Testing Google auth...');
            try {
                const token = await auth.getAccessToken();
                this.logger.log(`✅ Auth successful! Token obtained: ${token.token?.substring(0, 20)}...`);
            }
            catch (authError) {
                this.logger.error(`❌ Auth failed: ${authError.message}`);
                return;
            }
            this.sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            this.isConfigured = true;
            this.logger.log('✅ Google Sheets service initialized');
            this.logger.log(`   Sheet ID: ${this.sheetId.substring(0, 20)}...`);
            await this.refreshCache();
            setInterval(() => this.refreshCache(), 30000);
        }
        catch (error) {
            this.logger.error('Failed to initialize Google Sheets:', error.message);
            this.logger.error('Full error:', error);
        }
    }
    async refreshCache() {
        if (!this.isConfigured || !this.sheets) {
            return;
        }
        try {
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
        }
        catch (error) {
            this.logger.error('Failed to fetch Google Sheets data:');
            this.logger.error(error.message);
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
    getCachedRows() {
        return {
            rows: this.cachedRows,
            count: this.cachedRows.length,
        };
    }
    getCachedRowsSummary() {
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
    getConnectionStatus() {
        return {
            connected: this.isConfigured && this.cachedRows.length > 0,
            records: this.cachedRows.length,
            lastSync: this.lastSync?.toISOString() || null,
            sheetId: this.sheetId ? `${this.sheetId.substring(0, 10)}...` : '',
            sheetName: 'Project Manager Data',
        };
    }
    isReady() {
        return this.isConfigured;
    }
    getRowsByStatus(status) {
        return this.cachedRows.filter((row) => row.status.toLowerCase() === status.toLowerCase());
    }
    getRowsByPriority(priority) {
        return this.cachedRows.filter((row) => row.priority.toLowerCase() === priority.toLowerCase());
    }
    getHighRiskItems() {
        return this.cachedRows.filter((row) => row.riskLevel.toLowerCase() === 'high');
    }
    getItemsDueSoon() {
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return this.cachedRows.filter((row) => {
            if (!row.dueDate)
                return false;
            const dueDate = new Date(row.dueDate);
            return dueDate >= now && dueDate <= weekFromNow;
        });
    }
};
exports.GoogleSheetsService = GoogleSheetsService;
exports.GoogleSheetsService = GoogleSheetsService = GoogleSheetsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GoogleSheetsService);
//# sourceMappingURL=googlesheets.service.js.map