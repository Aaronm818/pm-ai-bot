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
var TTSService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTSService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const AZURE_VOICE = 'en-US-GuyNeural';
let TTSService = TTSService_1 = class TTSService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(TTSService_1.name);
        this.isConfigured = false;
        this.region = this.configService.get('AZURE_SPEECH_REGION') || '';
        this.subscriptionKey = this.configService.get('AZURE_SPEECH_KEY') ||
            this.configService.get('OPENAI_API_KEY') || '';
        if (!this.region) {
            this.logger.error('❌ AZURE_SPEECH_REGION not set in .env file!');
            this.logger.error('   Add: AZURE_SPEECH_REGION=eastus (or your region)');
            this.logger.error('   Valid regions: eastus, westus, westus2, centralus, etc.');
        }
        if (!this.subscriptionKey) {
            this.logger.error('❌ AZURE_SPEECH_KEY not set in .env file!');
            this.logger.error('   Add: AZURE_SPEECH_KEY=your-key-from-azure-portal');
        }
        if (this.region && this.subscriptionKey) {
            this.isConfigured = true;
            this.logger.log(`✅ Azure Native Neural TTS initialized`);
            this.logger.log(`   Voice: ${AZURE_VOICE} (consistent!)`);
            this.logger.log(`   Region: ${this.region}`);
            this.logger.log(`   Endpoint: https://${this.region}.tts.speech.microsoft.com`);
        }
        else {
            this.logger.warn('⚠️ Azure Neural TTS NOT configured - voice will not work');
        }
    }
    async textToSpeech(text, voice = AZURE_VOICE) {
        if (!this.isConfigured) {
            this.logger.error('Azure Neural TTS not configured - check .env file');
            this.logger.error('Required: AZURE_SPEECH_REGION and AZURE_SPEECH_KEY');
            return { audioBase64: '', error: 'TTS not configured - check server logs' };
        }
        const actualVoice = AZURE_VOICE;
        try {
            this.logger.log(`🔊 Azure Neural TTS (${actualVoice}): "${text.substring(0, 50)}..." (${text.length} chars)`);
            const ttsEndpoint = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
            const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${actualVoice}'>
    ${this.escapeXml(text)}
  </voice>
</speak>`;
            this.logger.debug(`TTS Endpoint: ${ttsEndpoint}`);
            const response = await fetch(ttsEndpoint, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': this.subscriptionKey,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm',
                    'User-Agent': 'PM-AI-Bot',
                },
                body: ssml,
            });
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Azure TTS error: ${response.status} - ${errorText}`);
                if (response.status === 401) {
                    this.logger.error('❌ Authentication failed!');
                    this.logger.error('   Check AZURE_SPEECH_KEY is correct');
                    this.logger.error('   Key should be from: Azure Portal > Speech Service > Keys and Endpoint');
                }
                else if (response.status === 404) {
                    this.logger.error('❌ Endpoint not found!');
                    this.logger.error(`   Current region: ${this.region}`);
                    this.logger.error('   Valid regions: eastus, westus, westus2, centralus, northeurope, etc.');
                }
                else if (response.status === 400) {
                    this.logger.error('❌ Bad request - check SSML format');
                }
                return { audioBase64: '', error: `TTS error: ${response.status}` };
            }
            const audioBuffer = await response.arrayBuffer();
            const audioBase64 = Buffer.from(audioBuffer).toString('base64');
            this.logger.log(`✅ Azure Neural TTS complete: ${audioBase64.length} bytes (voice: ${actualVoice})`);
            return { audioBase64 };
        }
        catch (error) {
            this.logger.error(`Azure TTS failed:`, error);
            return { audioBase64: '', error: error.message };
        }
    }
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    async *streamTextToSpeech(text, voice = AZURE_VOICE) {
        const sentences = this.splitIntoSentences(text);
        for (const sentence of sentences) {
            if (sentence.trim()) {
                const result = await this.textToSpeech(sentence, AZURE_VOICE);
                if (result.audioBase64 && !result.error) {
                    yield result.audioBase64;
                }
            }
        }
    }
    splitIntoSentences(text) {
        const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        return sentences.map(s => s.trim()).filter(s => s.length > 0);
    }
    async textToSpeechChunked(text, voice = AZURE_VOICE, onChunk) {
        this.logger.log(`🔊 Azure Neural TTS: Converting ${text.length} chars (voice: ${AZURE_VOICE})`);
        const result = await this.textToSpeech(text, AZURE_VOICE);
        if (result.audioBase64 && !result.error) {
            onChunk(result.audioBase64);
        }
    }
    static getAvailableVoices() {
        return [
            { name: 'en-US-JennyNeural', gender: 'Female', style: 'Friendly, warm' },
            { name: 'en-US-GuyNeural', gender: 'Male', style: 'Professional, clear' },
            { name: 'en-US-AriaNeural', gender: 'Female', style: 'Professional, versatile' },
            { name: 'en-US-DavisNeural', gender: 'Male', style: 'Casual, friendly' },
            { name: 'en-US-JaneNeural', gender: 'Female', style: 'Calm, soothing' },
            { name: 'en-US-JasonNeural', gender: 'Male', style: 'Confident, authoritative' },
            { name: 'en-US-SaraNeural', gender: 'Female', style: 'Cheerful, youthful' },
            { name: 'en-US-TonyNeural', gender: 'Male', style: 'Friendly, conversational' },
            { name: 'en-US-NancyNeural', gender: 'Female', style: 'Warm, empathetic' },
            { name: 'en-US-BrandonNeural', gender: 'Male', style: 'Engaging, energetic' },
        ];
    }
    async testConfiguration() {
        if (!this.isConfigured) {
            return {
                success: false,
                message: 'Not configured. Add AZURE_SPEECH_REGION and AZURE_SPEECH_KEY to .env'
            };
        }
        try {
            const result = await this.textToSpeech('Test');
            if (result.audioBase64 && !result.error) {
                return { success: true, message: `Working! Voice: ${AZURE_VOICE}, Region: ${this.region}` };
            }
            else {
                return { success: false, message: result.error || 'Unknown error' };
            }
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
};
exports.TTSService = TTSService;
exports.TTSService = TTSService = TTSService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TTSService);
//# sourceMappingURL=tts.service.js.map