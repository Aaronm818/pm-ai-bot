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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIRealtimeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const WebSocket = require("ws");
let OpenAIRealtimeService = class OpenAIRealtimeService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger('OpenAIRealtimeService');
        this.sessions = new Map();
        this.audioResponseCallback = null;
        this.transcriptCallback = null;
        this.getVisionContextCallback = null;
        this.speakingStateChangedCallback = null;
        this.pmTextResponseCallback = null;
        this.silentDocumentCallback = null;
        this.pmWakeWordPatterns = [
            /hey\s*p\.?m\.?/i,
            /hey\s*project\s*manager/i,
            /project\s*manager/i,
            /p\.?m\.?\s*bot/i,
        ];
        this.claudeWakeWordPatterns = [
            /hey\s*claude/i,
            /claude/i,
            /ask\s*claude/i,
        ];
        this.claudeRequestCallback = null;
    }
    onModuleInit() {
        this.logger.log('OpenAI Realtime Service initialized');
    }
    setAudioResponseCallback(callback) {
        this.audioResponseCallback = callback;
        if (callback === null) {
            this.logger.log('🔇 Audio callback disabled - using TTS for voice output');
        }
    }
    setTranscriptCallback(callback) {
        this.transcriptCallback = callback;
    }
    setVisionContextCallback(callback) {
        this.getVisionContextCallback = callback;
    }
    setSpeakingStateChangedCallback(callback) {
        this.speakingStateChangedCallback = callback;
    }
    setPmTextResponseCallback(callback) {
        this.pmTextResponseCallback = callback;
    }
    setClaudeRequestCallback(callback) {
        this.claudeRequestCallback = callback;
    }
    setSilentDocumentCallback(callback) {
        this.silentDocumentCallback = callback;
        this.logger.log('📄 Silent document callback registered');
    }
    isSpeaking(serverCallId) {
        return this.sessions.get(serverCallId)?.isSpeaking || false;
    }
    async createSession(serverCallId) {
        if (this.sessions.has(serverCallId)) {
            this.logger.log(`Session already exists for ${serverCallId}`);
            return true;
        }
        const endpoint = this.configService.get('OPENAI_ENDPOINT');
        const apiKey = this.configService.get('OPENAI_API_KEY');
        const deployment = this.configService.get('OPENAI_DEPLOYMENT') || 'gpt-realtime';
        this.logger.log(`[DEBUG] OPENAI_ENDPOINT = "${endpoint || 'NOT SET'}"`);
        this.logger.log(`[DEBUG] OPENAI_API_KEY = "${apiKey ? '***' + apiKey.slice(-4) : 'NOT SET'}"`);
        this.logger.log(`[DEBUG] OPENAI_DEPLOYMENT = "${deployment}"`);
        if (!endpoint || !apiKey) {
            this.logger.error('OpenAI endpoint or API key not configured');
            this.logger.error('Make sure .env file exists in project root with OPENAI_ENDPOINT and OPENAI_API_KEY');
            return false;
        }
        try {
            const wsUrl = `${endpoint.replace('https://', 'wss://')}/openai/realtime?api-version=2024-10-01-preview&deployment=${deployment}`;
            this.logger.log(`Connecting to OpenAI Realtime: ${wsUrl}`);
            const ws = new WebSocket(wsUrl, {
                headers: {
                    'api-key': apiKey,
                },
            });
            const session = {
                ws,
                serverCallId,
                transcript: [],
                isConnected: false,
                lastActivity: new Date(),
                isSpeaking: false,
            };
            this.sessions.set(serverCallId, session);
            ws.on('open', () => {
                this.logger.log(`OpenAI Realtime connected for ${serverCallId}`);
                session.isConnected = true;
                this.configureSession(serverCallId);
            });
            ws.on('message', (data) => {
                this.handleOpenAIMessage(serverCallId, data);
            });
            ws.on('error', (error) => {
                this.logger.error(`OpenAI Realtime error for ${serverCallId}: ${error.message}`);
            });
            ws.on('close', () => {
                this.logger.log(`OpenAI Realtime disconnected for ${serverCallId}`);
                session.isConnected = false;
            });
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to create OpenAI session: ${error.message}`);
            return false;
        }
    }
    configureSession(serverCallId) {
        const session = this.sessions.get(serverCallId);
        if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        const sessionConfig = {
            type: 'session.update',
            session: {
                modalities: ['text'],
                instructions: `You are PM AI Bot, a helpful Project Manager assistant for Teams meetings. 
You listen to conversations and respond when someone says "Hey PM" or "Project Manager".
Keep responses concise and helpful. Focus on action items, summaries, and meeting assistance.
If you can see the user's screen, use that context to provide more relevant answers.
When describing what you see on screen, be specific about the content visible.

IMPORTANT: When someone asks you to write a report, create an email, or generate any document:
- Say something like "Sure, I'll create that for you. Give me just a moment." or "Got it, working on that report now."
- Keep it brief and friendly
- The document will automatically appear in the Workspace tab`,
                input_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1',
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.8,
                    prefix_padding_ms: 500,
                    silence_duration_ms: 1500,
                    create_response: false,
                },
            },
        };
        session.ws.send(JSON.stringify(sessionConfig));
        this.logger.log(`✅ Session configured (TEXT ONLY - Azure Neural TTS for voice): ${serverCallId}`);
    }
    sendAudio(serverCallId, audioBase64) {
        const session = this.sessions.get(serverCallId);
        if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        if (session.isSpeaking) {
            return;
        }
        const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBase64,
        };
        session.ws.send(JSON.stringify(audioMessage));
        session.lastActivity = new Date();
    }
    handleOpenAIMessage(serverCallId, data) {
        const session = this.sessions.get(serverCallId);
        if (!session)
            return;
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'session.created':
                    this.logger.log(`Session created: ${serverCallId}`);
                    break;
                case 'session.updated':
                    this.logger.log(`Session updated: ${serverCallId}`);
                    break;
                case 'input_audio_buffer.speech_started':
                    this.logger.log(`Speech started: ${serverCallId}`);
                    break;
                case 'input_audio_buffer.speech_stopped':
                    this.logger.log(`Speech stopped: ${serverCallId}`);
                    break;
                case 'conversation.item.input_audio_transcription.completed':
                    this.handleTranscript(serverCallId, message.transcript);
                    break;
                case 'response.audio.delta':
                    if (!session.isSpeaking) {
                        session.isSpeaking = true;
                        this.logger.log(`🔊 PM S2S audio started: ${serverCallId}`);
                        const clearBuffer = { type: 'input_audio_buffer.clear' };
                        session.ws.send(JSON.stringify(clearBuffer));
                        if (this.speakingStateChangedCallback) {
                            this.speakingStateChangedCallback(serverCallId, true);
                        }
                    }
                    if (message.delta && this.audioResponseCallback) {
                        this.audioResponseCallback(serverCallId, message.delta);
                    }
                    break;
                case 'response.audio_transcript.delta':
                    if (message.delta && this.transcriptCallback) {
                        this.transcriptCallback(serverCallId, message.delta, false);
                    }
                    break;
                case 'response.audio_transcript.done':
                    this.logger.log(`📝 PM S2S transcript: "${message.transcript?.substring(0, 50)}..."`);
                    if (message.transcript && this.transcriptCallback) {
                        this.transcriptCallback(serverCallId, message.transcript, true);
                    }
                    break;
                case 'response.text.delta':
                    if (message.delta && this.transcriptCallback) {
                        this.transcriptCallback(serverCallId, message.delta, false);
                    }
                    break;
                case 'response.text.done':
                    this.logger.log(`📝 PM text response complete: ${serverCallId}`);
                    if (message.text && this.pmTextResponseCallback) {
                        this.pmTextResponseCallback(serverCallId, message.text);
                    }
                    break;
                case 'response.audio.done':
                    this.logger.log(`Audio segment done: ${serverCallId}`);
                    break;
                case 'response.done':
                    this.logger.log(`🔇 AI finished speaking: ${serverCallId}`);
                    setTimeout(() => {
                        const sess = this.sessions.get(serverCallId);
                        if (sess) {
                            sess.isSpeaking = false;
                            this.logger.log(`🎤 Resuming audio input for: ${serverCallId}`);
                            if (this.speakingStateChangedCallback) {
                                this.speakingStateChangedCallback(serverCallId, false);
                            }
                        }
                    }, 500);
                    break;
                case 'error':
                    this.logger.error(`OpenAI error: ${JSON.stringify(message.error)}`);
                    session.isSpeaking = false;
                    break;
                default:
                    if (message.type && !message.type.startsWith('response.content_part')) {
                        this.logger.debug(`OpenAI message: ${message.type}`);
                    }
            }
        }
        catch (error) {
            this.logger.error(`Error parsing OpenAI message: ${error.message}`);
        }
    }
    async handleTranscript(serverCallId, transcript) {
        const session = this.sessions.get(serverCallId);
        if (!session || !transcript)
            return;
        this.logger.log(`Transcript [${serverCallId}]: ${transcript}`);
        session.transcript.push({
            role: 'user',
            text: transcript,
            timestamp: new Date(),
        });
        if (this.transcriptCallback) {
            this.transcriptCallback(serverCallId, transcript, true);
        }
        const hasPmWakeWord = this.pmWakeWordPatterns.some((pattern) => pattern.test(transcript));
        const hasClaudeWakeWord = this.claudeWakeWordPatterns.some((pattern) => pattern.test(transcript));
        if (hasClaudeWakeWord && this.claudeRequestCallback) {
            this.logger.log(`🧠 CLAUDE WAKE WORD DETECTED in: "${transcript}"`);
            const visionContext = this.getVisionContextCallback ? this.getVisionContextCallback(serverCallId) : null;
            await this.claudeRequestCallback(serverCallId, transcript, visionContext);
            return;
        }
        if (hasPmWakeWord) {
            this.logger.log(`🎯 PM WAKE WORD DETECTED in: "${transcript}"`);
            const isDocumentRequest = /write\s+(me\s+)?(a\s+)?(status\s+)?report|create\s+(me\s+)?(a\s+)?report|generate\s+(me\s+)?(a\s+)?report|make\s+(me\s+)?(a\s+)?report|draft\s+(me\s+)?(an?\s+)?email|write\s+(me\s+)?(an?\s+)?email|create\s+(me\s+)?(a\s+)?summary|write\s+(me\s+)?(a\s+)?summary|summarize|summary\s+of|prepare\s+(me\s+)?(a\s+)?(report|summary|email)|give\s+me\s+(a\s+)?(report|summary)|can\s+you\s+(create|write|make|generate)\s+(me\s+)?(a\s+)?(report|summary|email)/i.test(transcript);
            this.logger.log(`📄 Checking document request: "${transcript}" => ${isDocumentRequest}`);
            if (isDocumentRequest && this.silentDocumentCallback) {
                this.logger.log(`📄 DOCUMENT REQUEST MATCHED: PM will speak (S2S), Claude builds silently`);
                this.triggerResponse(serverCallId);
                try {
                    await this.silentDocumentCallback(serverCallId, transcript);
                    this.logger.log(`📄 Silent document callback completed`);
                }
                catch (err) {
                    this.logger.error(`📄 Silent document callback error:`, err);
                }
                return;
            }
            const isVisionQuestion = /see|screen|looking at|what('s| is) on|show|display|visible/i.test(transcript);
            if (isVisionQuestion && this.getVisionContextCallback) {
                const screenshot = this.getVisionContextCallback(serverCallId);
                if (screenshot) {
                    this.logger.log(`📷 Vision question detected, analyzing screenshot...`);
                    await this.triggerResponseWithVision(serverCallId, transcript, screenshot);
                    return;
                }
            }
            this.triggerResponse(serverCallId);
        }
    }
    triggerResponse(serverCallId) {
        const session = this.sessions.get(serverCallId);
        if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
            this.logger.warn(`Cannot trigger response - no active session for ${serverCallId}`);
            return;
        }
        this.logger.log(`🚀 TRIGGERING AI RESPONSE for ${serverCallId}`);
        const responseCreate = {
            type: 'response.create',
            response: {
                modalities: ['text', 'audio'],
            },
        };
        session.ws.send(JSON.stringify(responseCreate));
    }
    async triggerResponseWithVision(serverCallId, userQuestion, screenshotBase64) {
        const session = this.sessions.get(serverCallId);
        if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const visionDescription = await this.analyzeScreenshot(screenshotBase64, userQuestion);
            if (visionDescription) {
                this.logger.log(`📷 Vision analysis: ${visionDescription.substring(0, 100)}...`);
                const contextItem = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: `[SCREEN CONTEXT: ${visionDescription}]\n\nThe user asked: "${userQuestion}"`,
                            },
                        ],
                    },
                };
                session.ws.send(JSON.stringify(contextItem));
            }
            const responseCreate = {
                type: 'response.create',
                response: {
                    modalities: ['text', 'audio'],
                },
            };
            session.ws.send(JSON.stringify(responseCreate));
        }
        catch (error) {
            this.logger.error(`Vision analysis failed: ${error.message}`);
            this.triggerResponse(serverCallId);
        }
    }
    async analyzeScreenshot(screenshotBase64, userQuestion) {
        const endpoint = this.configService.get('OPENAI_ENDPOINT');
        const apiKey = this.configService.get('OPENAI_API_KEY');
        if (!endpoint || !apiKey) {
            return null;
        }
        try {
            const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
            const visionDeployments = ['gpt-4.1', 'gpt-4o', 'gpt-4-vision'];
            for (const deployment of visionDeployments) {
                const visionUrl = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`;
                try {
                    const response = await fetch(visionUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'api-key': apiKey,
                        },
                        body: JSON.stringify({
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are helping a meeting assistant describe what is visible on a shared screen. Be concise but specific about what you see - text, applications, data, charts, presentations, etc.',
                                },
                                {
                                    role: 'user',
                                    content: [
                                        {
                                            type: 'text',
                                            text: `The user asked: "${userQuestion}". Describe what you see on this screen that would help answer their question.`,
                                        },
                                        {
                                            type: 'image_url',
                                            image_url: {
                                                url: `data:image/jpeg;base64,${base64Data}`,
                                            },
                                        },
                                    ],
                                },
                            ],
                            max_tokens: 500,
                        }),
                    });
                    if (response.ok) {
                        const data = await response.json();
                        return data.choices?.[0]?.message?.content || null;
                    }
                }
                catch (e) {
                    this.logger.debug(`Vision deployment ${deployment} failed: ${e.message}`);
                }
            }
            return null;
        }
        catch (error) {
            this.logger.error(`Screenshot analysis error: ${error.message}`);
            return null;
        }
    }
    endSession(serverCallId) {
        const session = this.sessions.get(serverCallId);
        if (session?.ws) {
            session.ws.close();
        }
        this.sessions.delete(serverCallId);
        this.logger.log(`Session ended: ${serverCallId}`);
    }
    getTranscript(serverCallId) {
        return this.sessions.get(serverCallId)?.transcript || [];
    }
    getSessionStatus(serverCallId) {
        const session = this.sessions.get(serverCallId);
        if (!session)
            return null;
        return {
            serverCallId,
            isConnected: session.isConnected,
            isSpeaking: session.isSpeaking,
            transcriptCount: session.transcript.length,
            lastActivity: session.lastActivity,
        };
    }
    getActiveSessions() {
        return Array.from(this.sessions.keys());
    }
};
exports.OpenAIRealtimeService = OpenAIRealtimeService;
exports.OpenAIRealtimeService = OpenAIRealtimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAIRealtimeService);
//# sourceMappingURL=openai-realtime.service.js.map