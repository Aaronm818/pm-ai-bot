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
var FileOutputService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOutputService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs = require("fs");
const path = require("path");
let FileOutputService = FileOutputService_1 = class FileOutputService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(FileOutputService_1.name);
        this.savedFiles = new Map();
        this.outputDir = path.join(process.cwd(), 'public', 'outputs');
        this.ensureOutputDirectory();
        this.logger.log(`FileOutputService initialized. Output dir: ${this.outputDir}`);
    }
    ensureOutputDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            this.logger.log(`Created output directory: ${this.outputDir}`);
        }
    }
    analyzeContent(userRequest, claudeResponse) {
        const requestLower = userRequest.toLowerCase();
        const responseLower = claudeResponse.toLowerCase();
        if (requestLower.includes('email') ||
            requestLower.includes('write to') ||
            requestLower.includes('message to') ||
            responseLower.includes('subject:') ||
            responseLower.includes('dear ')) {
            return {
                shouldSave: true,
                contentType: 'email',
                suggestedFilename: this.generateFilename('email', userRequest),
                fileExtension: '.txt',
            };
        }
        if (requestLower.includes('code') ||
            requestLower.includes('script') ||
            requestLower.includes('function') ||
            requestLower.includes('program') ||
            claudeResponse.includes('```')) {
            const extension = this.detectCodeExtension(requestLower, claudeResponse);
            return {
                shouldSave: true,
                contentType: 'code',
                suggestedFilename: this.generateFilename('code', userRequest),
                fileExtension: extension,
            };
        }
        if (requestLower.includes('document') ||
            requestLower.includes('report') ||
            requestLower.includes('write a') ||
            requestLower.includes('create a') ||
            requestLower.includes('draft')) {
            return {
                shouldSave: true,
                contentType: 'document',
                suggestedFilename: this.generateFilename('document', userRequest),
                fileExtension: '.md',
            };
        }
        if (requestLower.includes('presentation') ||
            requestLower.includes('outline') ||
            requestLower.includes('slides') ||
            requestLower.includes('agenda')) {
            return {
                shouldSave: true,
                contentType: 'report',
                suggestedFilename: this.generateFilename('outline', userRequest),
                fileExtension: '.md',
            };
        }
        if (requestLower.includes('list') ||
            requestLower.includes('steps') ||
            requestLower.includes('instructions') ||
            requestLower.includes('how to')) {
            return {
                shouldSave: true,
                contentType: 'list',
                suggestedFilename: this.generateFilename('list', userRequest),
                fileExtension: '.md',
            };
        }
        if (claudeResponse.length > 200) {
            return {
                shouldSave: true,
                contentType: 'general',
                suggestedFilename: this.generateFilename('response', userRequest),
                fileExtension: '.md',
            };
        }
        return {
            shouldSave: false,
            contentType: 'general',
            suggestedFilename: '',
            fileExtension: '',
        };
    }
    detectCodeExtension(request, response) {
        if (request.includes('python') || response.includes('```python'))
            return '.py';
        if (request.includes('javascript') || response.includes('```javascript') || response.includes('```js'))
            return '.js';
        if (request.includes('typescript') || response.includes('```typescript') || response.includes('```ts'))
            return '.ts';
        if (request.includes('html') || response.includes('```html'))
            return '.html';
        if (request.includes('css') || response.includes('```css'))
            return '.css';
        if (request.includes('sql') || response.includes('```sql'))
            return '.sql';
        if (request.includes('bash') || request.includes('shell') || response.includes('```bash'))
            return '.sh';
        if (request.includes('powershell') || response.includes('```powershell'))
            return '.ps1';
        if (request.includes('json') || response.includes('```json'))
            return '.json';
        if (request.includes('yaml') || response.includes('```yaml'))
            return '.yaml';
        return '.txt';
    }
    generateFilename(type, request) {
        const words = request
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(' ')
            .filter(w => w.length > 2 && !['the', 'and', 'for', 'write', 'create', 'make', 'build', 'hey', 'claude', 'can', 'you', 'please'].includes(w))
            .slice(0, 3);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const keyWords = words.length > 0 ? words.join('-') : type;
        return `${type}-${keyWords}-${timestamp}`;
    }
    async saveContent(sessionId, content, filename, extension, contentType) {
        this.ensureOutputDirectory();
        const fullFilename = `${filename}${extension}`;
        const filepath = path.join(this.outputDir, fullFilename);
        let formattedContent = content;
        if (contentType === 'code' && content.includes('```')) {
            formattedContent = this.extractCodeFromMarkdown(content);
        }
        fs.writeFileSync(filepath, formattedContent, 'utf8');
        const stats = fs.statSync(filepath);
        const baseUrl = this.configService.get('BASE_URL') || 'http://localhost:3000';
        const savedFile = {
            filename: fullFilename,
            filepath: filepath,
            url: `${baseUrl}/outputs/${fullFilename}`,
            type: contentType,
            size: stats.size,
            createdAt: new Date().toISOString(),
        };
        if (!this.savedFiles.has(sessionId)) {
            this.savedFiles.set(sessionId, []);
        }
        this.savedFiles.get(sessionId).push(savedFile);
        this.logger.log(`📁 Saved file: ${fullFilename} (${stats.size} bytes)`);
        return savedFile;
    }
    extractCodeFromMarkdown(content) {
        const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
        const matches = content.matchAll(codeBlockRegex);
        const codeBlocks = [];
        for (const match of matches) {
            codeBlocks.push(match[1].trim());
        }
        if (codeBlocks.length > 0) {
            return codeBlocks.join('\n\n');
        }
        return content;
    }
    getSessionFiles(sessionId) {
        return this.savedFiles.get(sessionId) || [];
    }
    clearSessionFiles(sessionId) {
        const files = this.savedFiles.get(sessionId) || [];
        this.savedFiles.delete(sessionId);
        this.logger.log(`Cleared file tracking for session: ${sessionId}`);
    }
    getAllFiles() {
        const allFiles = [];
        for (const files of this.savedFiles.values()) {
            allFiles.push(...files);
        }
        return allFiles;
    }
};
exports.FileOutputService = FileOutputService;
exports.FileOutputService = FileOutputService = FileOutputService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FileOutputService);
//# sourceMappingURL=file-output.service.js.map