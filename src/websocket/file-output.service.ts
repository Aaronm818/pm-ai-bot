import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

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

@Injectable()
export class FileOutputService {
  private readonly logger = new Logger(FileOutputService.name);
  private readonly outputDir: string;
  private savedFiles: Map<string, SavedFile[]> = new Map(); // sessionId -> files

  constructor(private readonly configService: ConfigService) {
    // Create output directory in public folder for serving
    this.outputDir = path.join(process.cwd(), 'public', 'outputs');
    this.ensureOutputDirectory();
    this.logger.log(`FileOutputService initialized. Output dir: ${this.outputDir}`);
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      this.logger.log(`Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Analyze content to determine if it should be saved and what type it is
   */
  analyzeContent(userRequest: string, claudeResponse: string): ContentAnalysis {
    const requestLower = userRequest.toLowerCase();
    const responseLower = claudeResponse.toLowerCase();

    // Check for email requests
    if (
      requestLower.includes('email') ||
      requestLower.includes('write to') ||
      requestLower.includes('message to') ||
      responseLower.includes('subject:') ||
      responseLower.includes('dear ')
    ) {
      return {
        shouldSave: true,
        contentType: 'email',
        suggestedFilename: this.generateFilename('email', userRequest),
        fileExtension: '.txt',
      };
    }

    // Check for code requests
    if (
      requestLower.includes('code') ||
      requestLower.includes('script') ||
      requestLower.includes('function') ||
      requestLower.includes('program') ||
      claudeResponse.includes('```')
    ) {
      const extension = this.detectCodeExtension(requestLower, claudeResponse);
      return {
        shouldSave: true,
        contentType: 'code',
        suggestedFilename: this.generateFilename('code', userRequest),
        fileExtension: extension,
      };
    }

    // Check for document/report requests
    if (
      requestLower.includes('document') ||
      requestLower.includes('report') ||
      requestLower.includes('write a') ||
      requestLower.includes('create a') ||
      requestLower.includes('draft')
    ) {
      return {
        shouldSave: true,
        contentType: 'document',
        suggestedFilename: this.generateFilename('document', userRequest),
        fileExtension: '.md',
      };
    }

    // Check for presentation/outline requests
    if (
      requestLower.includes('presentation') ||
      requestLower.includes('outline') ||
      requestLower.includes('slides') ||
      requestLower.includes('agenda')
    ) {
      return {
        shouldSave: true,
        contentType: 'report',
        suggestedFilename: this.generateFilename('outline', userRequest),
        fileExtension: '.md',
      };
    }

    // Check for list requests
    if (
      requestLower.includes('list') ||
      requestLower.includes('steps') ||
      requestLower.includes('instructions') ||
      requestLower.includes('how to')
    ) {
      return {
        shouldSave: true,
        contentType: 'list',
        suggestedFilename: this.generateFilename('list', userRequest),
        fileExtension: '.md',
      };
    }

    // Check if response is substantial enough to save (more than 200 chars)
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

  /**
   * Detect appropriate code file extension
   */
  private detectCodeExtension(request: string, response: string): string {
    if (request.includes('python') || response.includes('```python')) return '.py';
    if (request.includes('javascript') || response.includes('```javascript') || response.includes('```js')) return '.js';
    if (request.includes('typescript') || response.includes('```typescript') || response.includes('```ts')) return '.ts';
    if (request.includes('html') || response.includes('```html')) return '.html';
    if (request.includes('css') || response.includes('```css')) return '.css';
    if (request.includes('sql') || response.includes('```sql')) return '.sql';
    if (request.includes('bash') || request.includes('shell') || response.includes('```bash')) return '.sh';
    if (request.includes('powershell') || response.includes('```powershell')) return '.ps1';
    if (request.includes('json') || response.includes('```json')) return '.json';
    if (request.includes('yaml') || response.includes('```yaml')) return '.yaml';
    return '.txt';
  }

  /**
   * Generate a descriptive filename from the request
   */
  private generateFilename(type: string, request: string): string {
    // Extract key words from request
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

  /**
   * Save content to a file
   */
  async saveContent(
    sessionId: string,
    content: string,
    filename: string,
    extension: string,
    contentType: string,
  ): Promise<SavedFile> {
    this.ensureOutputDirectory();

    const fullFilename = `${filename}${extension}`;
    const filepath = path.join(this.outputDir, fullFilename);
    
    // Format content based on type
    let formattedContent = content;
    if (contentType === 'code' && content.includes('```')) {
      // Extract code from markdown code blocks
      formattedContent = this.extractCodeFromMarkdown(content);
    }

    // Write file
    fs.writeFileSync(filepath, formattedContent, 'utf8');

    const stats = fs.statSync(filepath);
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    
    const savedFile: SavedFile = {
      filename: fullFilename,
      filepath: filepath,
      url: `${baseUrl}/outputs/${fullFilename}`,
      type: contentType,
      size: stats.size,
      createdAt: new Date().toISOString(),
    };

    // Track files per session
    if (!this.savedFiles.has(sessionId)) {
      this.savedFiles.set(sessionId, []);
    }
    this.savedFiles.get(sessionId)!.push(savedFile);

    this.logger.log(`📁 Saved file: ${fullFilename} (${stats.size} bytes)`);

    return savedFile;
  }

  /**
   * Extract code from markdown code blocks
   */
  private extractCodeFromMarkdown(content: string): string {
    const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
    const matches = content.matchAll(codeBlockRegex);
    const codeBlocks: string[] = [];
    
    for (const match of matches) {
      codeBlocks.push(match[1].trim());
    }

    if (codeBlocks.length > 0) {
      return codeBlocks.join('\n\n');
    }
    
    return content;
  }

  /**
   * Save a base64-encoded image to a file
   */
  async saveImage(
    sessionId: string,
    base64Data: string,
    filename: string,
  ): Promise<SavedFile> {
    this.ensureOutputDirectory();

    // Strip data URI prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    const fullFilename = `${filename}.jpg`;
    const filepath = path.join(this.outputDir, fullFilename);

    fs.writeFileSync(filepath, buffer);

    const stats = fs.statSync(filepath);
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';

    const savedFile: SavedFile = {
      filename: fullFilename,
      filepath: filepath,
      url: `${baseUrl}/outputs/${fullFilename}`,
      type: 'screenshot',
      size: stats.size,
      createdAt: new Date().toISOString(),
    };

    if (!this.savedFiles.has(sessionId)) {
      this.savedFiles.set(sessionId, []);
    }
    this.savedFiles.get(sessionId)!.push(savedFile);

    this.logger.log(`📸 Saved screenshot: ${fullFilename} (${stats.size} bytes)`);

    return savedFile;
  }

  /**
   * Get all saved files for a session
   */
  getSessionFiles(sessionId: string): SavedFile[] {
    return this.savedFiles.get(sessionId) || [];
  }

  /**
   * Clear files for a session
   */
  clearSessionFiles(sessionId: string): void {
    const files = this.savedFiles.get(sessionId) || [];
    
    // Optionally delete physical files
    // for (const file of files) {
    //   if (fs.existsSync(file.filepath)) {
    //     fs.unlinkSync(file.filepath);
    //   }
    // }

    this.savedFiles.delete(sessionId);
    this.logger.log(`Cleared file tracking for session: ${sessionId}`);
  }

  /**
   * Get all saved files
   */
  getAllFiles(): SavedFile[] {
    const allFiles: SavedFile[] = [];
    for (const files of this.savedFiles.values()) {
      allFiles.push(...files);
    }
    return allFiles;
  }
}
