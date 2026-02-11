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
var WebSocketGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const ws_1 = require("ws");
const openai_realtime_service_1 = require("./openai-realtime.service");
const claude_service_1 = require("./claude.service");
const tts_service_1 = require("./tts.service");
const file_output_service_1 = require("./file-output.service");
const dataverse_service_1 = require("./dataverse.service");
let WebSocketGateway = WebSocketGateway_1 = class WebSocketGateway {
    constructor(openAIRealtimeService, claudeService, ttsService, fileOutputService, dataverseService) {
        this.openAIRealtimeService = openAIRealtimeService;
        this.claudeService = claudeService;
        this.ttsService = ttsService;
        this.fileOutputService = fileOutputService;
        this.dataverseService = dataverseService;
        this.logger = new common_1.Logger(WebSocketGateway_1.name);
        this.clients = new Map();
        this.clientIdCounter = 0;
    }
    afterInit() {
        this.logger.log('✅ WebSocketGateway initialized');
        this.logger.log('   Voice Engine: OpenAI Realtime API (gpt-realtime full model)');
        this.logger.log('   Architecture: True S2S with wake word detection');
        this.claudeService.setCachedDataCallback(() => {
            return this.dataverseService.getCachedTasksSummary();
        });
        this.setupRealtimeCallbacks();
    }
    setupRealtimeCallbacks() {
        const s2sSpeakingState = new Map();
        this.openAIRealtimeService.setAudioResponseCallback((serverCallId, audioBase64) => {
            const session = this.findSessionByServerCallId(serverCallId);
            if (session && session.socket.readyState === ws_1.WebSocket.OPEN) {
                if (!s2sSpeakingState.get(serverCallId)) {
                    s2sSpeakingState.set(serverCallId, true);
                    this.sendToClient(session.socket, 'speaking_state', { isSpeaking: true });
                }
                this.sendToClient(session.socket, 'audio', {
                    audio: audioBase64,
                    source: 'S2S',
                    format: 'pcm16',
                    sampleRate: 24000,
                });
                this.logger.debug(`🔊 [S2S] Sent audio: ${audioBase64.length} bytes`);
            }
        });
        this.openAIRealtimeService.setTranscriptCallback((serverCallId, text, isFinal) => {
            const session = this.findSessionByServerCallId(serverCallId);
            if (session && session.socket.readyState === ws_1.WebSocket.OPEN) {
                this.sendToClient(session.socket, 'transcript', {
                    text,
                    isFinal,
                    source: 'user',
                });
            }
        });
        this.openAIRealtimeService.setVisionContextCallback((serverCallId) => {
            const session = this.findSessionByServerCallId(serverCallId);
            return session?.latestScreenshot || null;
        });
        this.openAIRealtimeService.setSpeakingStateChangedCallback((serverCallId, isSpeaking) => {
            const session = this.findSessionByServerCallId(serverCallId);
            if (session && session.socket.readyState === ws_1.WebSocket.OPEN) {
                if (!isSpeaking) {
                    s2sSpeakingState.set(serverCallId, false);
                }
                this.sendToClient(session.socket, 'speaking_state', { isSpeaking });
            }
        });
        this.openAIRealtimeService.setPmTextResponseCallback(async (serverCallId, text) => {
            const session = this.findSessionByServerCallId(serverCallId);
            if (session && session.socket.readyState === ws_1.WebSocket.OPEN) {
                this.sendToClient(session.socket, 'pm_response', { text, source: 'pm' });
                const ttsResult = await this.ttsService.textToSpeech(text);
                if (ttsResult.audioBase64 && !ttsResult.error) {
                    this.sendToClient(session.socket, 'audio', {
                        audio: ttsResult.audioBase64,
                        source: 'TTS',
                        format: 'pcm16',
                        sampleRate: 24000,
                    });
                }
            }
        });
        this.openAIRealtimeService.setClaudeRequestCallback(async (serverCallId, transcript, visionContext) => {
            const session = this.findSessionByServerCallId(serverCallId);
            if (!session)
                return;
            this.logger.log(`🧠 Claude request: "${transcript}"`);
            try {
                const response = await this.claudeService.chat(serverCallId, transcript, visionContext || undefined);
                if (response.error) {
                    this.logger.error(`Claude error: ${response.error}`);
                    this.sendToClient(session.socket, 'error', { message: response.error, source: 'claude' });
                    return;
                }
                this.sendToClient(session.socket, 'claude_response', { text: response.text, source: 'claude' });
                if (response.document && response.document.content) {
                    this.logger.log(`📄 Document generated by Claude: ${response.document.type}`);
                    const filename = `${response.document.type}-${response.document.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}`;
                    const savedFile = await this.fileOutputService.saveContent(serverCallId, response.document.content, filename, 'md', response.document.type);
                    this.sendToClient(session.socket, 'file_saved', {
                        filename: savedFile.filename,
                        url: savedFile.url,
                        documentType: savedFile.type,
                        content: response.document.content,
                    });
                    this.logger.log(`📄 file_saved message sent to client: ${savedFile.filename}`);
                }
                else {
                    const analysis = this.fileOutputService.analyzeContent(transcript, response.text);
                    if (analysis.shouldSave && analysis.suggestedFilename) {
                        const savedFile = await this.fileOutputService.saveContent(serverCallId, response.text, analysis.suggestedFilename, analysis.fileExtension, analysis.contentType);
                        this.sendToClient(session.socket, 'file_saved', {
                            filename: savedFile.filename,
                            url: savedFile.url,
                            documentType: savedFile.type,
                        });
                    }
                }
                const ttsResult = await this.ttsService.textToSpeech(response.text);
                if (ttsResult.audioBase64 && !ttsResult.error) {
                    this.sendToClient(session.socket, 'audio', {
                        audio: ttsResult.audioBase64,
                        source: 'TTS',
                        format: 'pcm16',
                        sampleRate: 24000,
                    });
                }
            }
            catch (error) {
                this.logger.error('Claude request failed:', error);
                this.sendToClient(session.socket, 'error', { message: `Claude error: ${error.message}`, source: 'claude' });
            }
        });
        this.openAIRealtimeService.setSilentDocumentCallback(async (serverCallId, transcript) => {
            const session = this.findSessionByServerCallId(serverCallId);
            if (!session) {
                this.logger.warn(`📄 No session found for serverCallId: ${serverCallId}`);
                return;
            }
            this.logger.log(`📄 Silent document request: "${transcript}"`);
            this.logger.log(`📄 Calling Claude for document generation...`);
            try {
                const response = await this.claudeService.chat(serverCallId, transcript, undefined);
                this.logger.log(`📄 Claude response received: text=${response.text?.length || 0} chars, document=${response.document ? 'yes' : 'no'}`);
                if (response.error) {
                    this.logger.error('Document generation failed:', response.error);
                    this.sendToClient(session.socket, 'error', {
                        message: `Document generation failed: ${response.error}`,
                        source: 'claude'
                    });
                    return;
                }
                if (response.document && response.document.content) {
                    this.logger.log(`📄 Document generated: ${response.document.type} - ${response.document.title}`);
                    const filename = `${response.document.type}-${response.document.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}`;
                    const savedFile = await this.fileOutputService.saveContent(serverCallId, response.document.content, filename, 'md', response.document.type);
                    this.logger.log(`📄 File saved: ${savedFile.filename}`);
                    this.sendToClient(session.socket, 'file_saved', {
                        filename: savedFile.filename,
                        url: savedFile.url,
                        documentType: savedFile.type,
                        content: response.document.content,
                    });
                    this.logger.log(`📄 file_saved message sent to client`);
                }
                else if (response.text) {
                    this.logger.warn(`📄 No document object, saving text response instead`);
                    const savedFile = await this.fileOutputService.saveContent(serverCallId, response.text, 'Generated-Document', 'md', 'document');
                    this.sendToClient(session.socket, 'file_saved', {
                        filename: savedFile.filename,
                        url: savedFile.url,
                        documentType: 'document',
                        content: response.text,
                    });
                }
                else {
                    this.logger.error('No content returned from Claude');
                }
            }
            catch (error) {
                this.logger.error('Document generation failed:', error);
                this.sendToClient(session.socket, 'error', {
                    message: `Document generation error: ${error.message}`,
                    source: 'claude'
                });
            }
            this.logger.log(`📄 Silent document callback completed`);
        });
    }
    sendToClient(client, type, data) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({ type, ...data }));
        }
    }
    findSessionByServerCallId(serverCallId) {
        for (const session of this.clients.values()) {
            if (session.serverCallId === serverCallId) {
                return session;
            }
        }
        return undefined;
    }
    getClientId(client) {
        for (const [id, session] of this.clients) {
            if (session.socket === client) {
                return id;
            }
        }
        return undefined;
    }
    handleConnection(client) {
        const clientId = `client-${++this.clientIdCounter}`;
        const serverCallId = `call-${clientId}-${Date.now()}`;
        this.logger.log(`Client connected: ${clientId}`);
        this.clients.set(clientId, {
            socket: client,
            serverCallId,
            realtimeConnected: false,
        });
        this.sendToClient(client, 'connected', {
            clientId,
            serverCallId,
            engine: 'OpenAI Realtime (gpt-realtime)',
            message: 'Connected to PM AI Bot',
        });
        client.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(client, clientId, message);
            }
            catch (error) {
                this.logger.error('Failed to parse message:', error);
            }
        });
    }
    handleDisconnect(client) {
        const clientId = this.getClientId(client);
        if (clientId) {
            this.logger.log(`Client disconnected: ${clientId}`);
            const session = this.clients.get(clientId);
            if (session?.realtimeConnected) {
                this.openAIRealtimeService.endSession(session.serverCallId);
            }
            this.clients.delete(clientId);
        }
    }
    async handleMessage(client, clientId, message) {
        const session = this.clients.get(clientId);
        if (!session)
            return;
        switch (message.type) {
            case 'start_session':
                await this.handleStartSession(session, message);
                break;
            case 'audio':
                this.handleAudio(session, message);
                break;
            case 'screenshot':
            case 'vision_frame':
                this.handleScreenshot(session, message);
                break;
            case 'stop_session':
                this.handleStopSession(session);
                break;
            case 'trigger_response':
                this.handleTriggerResponse(session);
                break;
            default:
                this.logger.warn(`Unknown message type: ${message.type}`);
        }
    }
    async handleStartSession(session, data) {
        this.logger.log(`Starting OpenAI Realtime session for ${session.serverCallId}`);
        session.meetingContext = data?.meetingContext;
        session.userName = data?.userName;
        try {
            const connected = await this.openAIRealtimeService.createSession(session.serverCallId);
            if (connected) {
                session.realtimeConnected = true;
                const dataverseData = this.dataverseService.getCachedTasks();
                this.sendToClient(session.socket, 'session_started', {
                    serverCallId: session.serverCallId,
                    engine: 'OpenAI Realtime (gpt-realtime)',
                    message: 'S2S session active',
                    dataverseRecords: dataverseData.count,
                });
                this.logger.log(`📊 Dataverse cache: ${dataverseData.count} tasks available`);
            }
            else {
                this.sendToClient(session.socket, 'error', {
                    message: 'Failed to connect to OpenAI Realtime. Check OPENAI_ENDPOINT and OPENAI_API_KEY.',
                    source: 'gateway',
                });
            }
        }
        catch (error) {
            this.logger.error('Failed to start session:', error);
            this.sendToClient(session.socket, 'error', {
                message: `Session start failed: ${error.message}`,
                source: 'gateway',
            });
        }
    }
    handleAudio(session, data) {
        if (!session.realtimeConnected)
            return;
        const audioData = data.audio || data.data;
        if (audioData) {
            this.openAIRealtimeService.sendAudio(session.serverCallId, audioData);
        }
    }
    handleScreenshot(session, data) {
        session.latestScreenshot = data.image;
        this.logger.debug('Screenshot received and stored');
    }
    handleStopSession(session) {
        if (session.realtimeConnected) {
            this.openAIRealtimeService.endSession(session.serverCallId);
            session.realtimeConnected = false;
            this.sendToClient(session.socket, 'session_ended', { reason: 'User requested stop' });
        }
    }
    handleTriggerResponse(session) {
        if (session.realtimeConnected) {
            this.openAIRealtimeService.triggerResponse(session.serverCallId);
        }
    }
    getConnectedAcsClients() {
        return Array.from(this.clients.keys());
    }
    getAcsClientCount() {
        return this.clients.size;
    }
    getAudioSessionStats() {
        const stats = [];
        for (const [clientId, session] of this.clients) {
            stats.push({ clientId, connected: session.realtimeConnected });
        }
        return stats;
    }
    sendAudioToAcsClient(clientId, audioData) {
        const session = this.clients.get(clientId);
        if (session) {
            this.sendToClient(session.socket, 'audio', {
                audio: audioData,
                source: 'S2S',
                format: 'pcm16',
                sampleRate: 24000,
            });
            return true;
        }
        return false;
    }
    stopAudioForAcsClient(clientId) {
        const session = this.clients.get(clientId);
        if (session) {
            this.sendToClient(session.socket, 'audio_stopped', { reason: 'Server requested stop' });
            return true;
        }
        return false;
    }
    broadcastToAllClients(eventType, data) {
        for (const session of this.clients.values()) {
            this.sendToClient(session.socket, eventType, data);
        }
    }
    broadcastAudioData(audioData) {
        for (const session of this.clients.values()) {
            this.sendToClient(session.socket, 'audio', {
                audio: audioData,
                source: 'S2S',
                format: 'pcm16',
                sampleRate: 24000,
            });
        }
    }
    performCleanup() {
        for (const [clientId, session] of this.clients) {
            if (session.socket.readyState !== ws_1.WebSocket.OPEN) {
                this.logger.log(`Cleaning up disconnected client: ${clientId}`);
                if (session.realtimeConnected) {
                    this.openAIRealtimeService.endSession(session.serverCallId);
                }
                this.clients.delete(clientId);
            }
        }
    }
};
exports.WebSocketGateway = WebSocketGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", ws_1.Server)
], WebSocketGateway.prototype, "server", void 0);
exports.WebSocketGateway = WebSocketGateway = WebSocketGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __metadata("design:paramtypes", [openai_realtime_service_1.OpenAIRealtimeService,
        claude_service_1.ClaudeService,
        tts_service_1.TTSService,
        file_output_service_1.FileOutputService,
        dataverse_service_1.DataverseService])
], WebSocketGateway);
//# sourceMappingURL=websocket.gateway.js.map