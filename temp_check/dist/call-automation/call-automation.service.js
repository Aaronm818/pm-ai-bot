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
var CallAutomationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallAutomationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const communication_call_automation_1 = require("@azure/communication-call-automation");
const communication_common_1 = require("@azure/communication-common");
const call_events_types_1 = require("./call-events.types");
const websocket_service_1 = require("../websocket/websocket.service");
const axios_1 = require("axios");
const crypto = require("crypto");
let CallAutomationService = CallAutomationService_1 = class CallAutomationService {
    constructor(configService, webSocketService) {
        this.configService = configService;
        this.webSocketService = webSocketService;
        this.logger = new common_1.Logger(CallAutomationService_1.name);
        this.activeCalls = new Map();
        this.callConnections = new Map();
        this.audioStreamingSessions = new Map();
        const connectionString = this.configService.get('ACS_CONNECTION_STRING');
        if (!connectionString) {
            throw new Error('ACS_CONNECTION_STRING is required');
        }
        this.callAutomationClient = new communication_call_automation_1.CallAutomationClient(connectionString);
        const endpointMatch = connectionString.match(/endpoint=([^;]+)/i);
        const accessKeyMatch = connectionString.match(/accesskey=([^;]+)/i);
        this.acsEndpoint = endpointMatch ? endpointMatch[1] : '';
        this.acsAccessKey = accessKeyMatch ? accessKeyMatch[1] : '';
        this.logger.log('Call Automation Service initialized');
        this.logger.log(`ACS Endpoint: ${this.acsEndpoint}`);
    }
    async handleIncomingCall(eventData) {
        this.logger.log(`Incoming call: ${eventData.serverCallId}`);
        const callSession = {
            callConnectionId: eventData.callConnectionId,
            serverCallId: eventData.serverCallId,
            correlationId: eventData.correlationId,
            incomingCallContext: eventData.incomingCallContext,
            state: 'incoming',
            startTime: new Date(),
            participants: [],
            from: eventData.from,
            to: eventData.to,
        };
        this.activeCalls.set(eventData.serverCallId, callSession);
        try {
            await this.answerCall(eventData.incomingCallContext, eventData.serverCallId);
        }
        catch (error) {
            this.logger.error(`Failed to answer call ${eventData.callConnectionId}:`, error);
            this.updateCallState(eventData.callConnectionId, 'disconnected');
        }
    }
    async answerCall(incomingCallContext, serverCallId) {
        try {
            this.logger.log(`Answering call: ${serverCallId}`);
            const baseUrl = this.configService.get('BASE_URL', 'http://localhost:3000');
            const mediaStreamingConfig = this.createMediaStreamingConfig(baseUrl, serverCallId);
            const answerCallResult = await this.callAutomationClient.answerCall(incomingCallContext, `${baseUrl}/acs/events`, { mediaStreamingOptions: mediaStreamingConfig });
            const callConnection = answerCallResult.callConnection;
            this.callConnections.set(serverCallId, callConnection);
            const audioSession = {
                serverCallId,
                callConnectionId: answerCallResult.callConnectionProperties.callConnectionId,
                isStreaming: false,
            };
            this.audioStreamingSessions.set(serverCallId, audioSession);
            this.logger.log(`Call answered successfully: ${serverCallId}`);
            this.updateCallState(serverCallId, 'answered');
            setTimeout(async () => {
                await this.sendAudioTone(serverCallId, call_events_types_1.DEFAULT_DTMF_CONFIG);
                setTimeout(async () => {
                    await this.startAudioStreaming(serverCallId);
                }, call_events_types_1.DEFAULT_MEDIA_STREAMING_CONFIG.startDelayMs);
            }, call_events_types_1.DEFAULT_TTS_CONFIG.waitTimeMs);
        }
        catch (error) {
            this.logger.error(`Failed to answer call ${serverCallId}:`, error);
            throw error;
        }
    }
    async sendAudioTone(serverCallId, dtmfConfig = call_events_types_1.DEFAULT_DTMF_CONFIG) {
        const callConnection = this.callConnections.get(serverCallId);
        const callSession = this.activeCalls.get(serverCallId);
        if (!callConnection) {
            this.logger.warn(`Call connection not found for ${serverCallId}`);
            return;
        }
        if (!callSession || !callSession.from) {
            this.logger.warn(`Call session or caller information not found for ${serverCallId}`);
            return;
        }
        try {
            this.logger.log(`Sending DTMF tone "${dtmfConfig.tone}" to call ${serverCallId}`);
            const callMedia = callConnection.getCallMedia();
            const dtmfTone = this.stringToDtmfTone(dtmfConfig.tone);
            const targetIdentifier = this.prepareDtmfTarget(callSession.from);
            if (!targetIdentifier) {
                throw new Error(`Unsupported communication identifier type for DTMF`);
            }
            await callMedia.sendDtmfTones([dtmfTone], targetIdentifier);
            this.logger.log(`DTMF tone "${dtmfConfig.tone}" sent successfully to call ${serverCallId}`);
        }
        catch (error) {
            this.logger.error(`Failed to send DTMF tone to call ${serverCallId}:`, error);
        }
    }
    async sendTextToSpeech(serverCallId, ttsConfig = call_events_types_1.DEFAULT_TTS_CONFIG) {
        const callConnection = this.callConnections.get(serverCallId);
        const callSession = this.activeCalls.get(serverCallId);
        if (!callConnection) {
            this.logger.warn(`Call connection not found for ${serverCallId}`);
            return;
        }
        if (!callSession) {
            this.logger.warn(`Call session not found for ${serverCallId}`);
            return;
        }
        try {
            this.logger.log(`Generating text-to-speech for call ${serverCallId}: "${ttsConfig.text}"`);
            const openaiApiKey = this.configService.get('OPENAI_API_KEY');
            if (!openaiApiKey) {
                throw new Error('OPENAI_API_KEY is not configured');
            }
            const openaiTtsEndpoint = this.configService.get('OPENAI_TTS_ENDPOINT');
            if (!openaiTtsEndpoint) {
                throw new Error('OPENAI_TTS_ENDPOINT is not configured');
            }
            const ttsResponse = await axios_1.default.post(openaiTtsEndpoint, {
                model: "gpt-4o-mini-tts",
                input: ttsConfig.text,
                voice: this.mapVoiceToOpenAI(ttsConfig.voice || 'en-US-JennyNeural'),
                response_format: 'wav',
            }, {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer',
            });
            const audioBuffer = Buffer.from(ttsResponse.data);
            const audioBase64 = audioBuffer.toString('base64');
            this.logger.log(`Generated audio from OpenAI TTS, size: ${audioBuffer.length} bytes`);
            const success = this.webSocketService.sendAudioToAcsClient(serverCallId, audioBase64);
            if (success) {
                this.logger.log(`Text-to-speech audio sent successfully via WebSocket to call ${serverCallId}`);
            }
            else {
                this.logger.warn(`Failed to send audio via WebSocket - no active connection for ${serverCallId}`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to generate or send text-to-speech to call ${serverCallId}:`, error);
            throw error;
        }
    }
    mapVoiceToOpenAI(azureVoice) {
        const voiceMap = {
            'en-US-JennyNeural': 'alloy',
            'en-US-GuyNeural': 'echo',
            'en-US-AriaNeural': 'fable',
            'en-US-DavisNeural': 'onyx',
            'en-US-AmberNeural': 'nova',
            'en-US-AnaNeural': 'shimmer',
        };
        return voiceMap[azureVoice] || 'alloy';
    }
    stringToDtmfTone(tone) {
        switch (tone) {
            case '0': return communication_call_automation_1.DtmfTone.Zero;
            case '1': return communication_call_automation_1.DtmfTone.One;
            case '2': return communication_call_automation_1.DtmfTone.Two;
            case '3': return communication_call_automation_1.DtmfTone.Three;
            case '4': return communication_call_automation_1.DtmfTone.Four;
            case '5': return communication_call_automation_1.DtmfTone.Five;
            case '6': return communication_call_automation_1.DtmfTone.Six;
            case '7': return communication_call_automation_1.DtmfTone.Seven;
            case '8': return communication_call_automation_1.DtmfTone.Eight;
            case '9': return communication_call_automation_1.DtmfTone.Nine;
            case '*': return communication_call_automation_1.DtmfTone.Asterisk;
            case '#': return communication_call_automation_1.DtmfTone.Pound;
            default: return communication_call_automation_1.DtmfTone.One;
        }
    }
    prepareDtmfTarget(identifier) {
        if ((0, communication_common_1.isPhoneNumberIdentifier)(identifier))
            return identifier;
        if ((0, communication_common_1.isCommunicationUserIdentifier)(identifier))
            return identifier;
        if ((0, communication_common_1.isMicrosoftTeamsUserIdentifier)(identifier))
            return identifier;
        if ((0, communication_common_1.isUnknownIdentifier)(identifier))
            return identifier;
        if (identifier && typeof identifier === 'object') {
            const anyId = identifier;
            if (anyId.kind === 'phoneNumber' && anyId.phoneNumber) {
                return { phoneNumber: anyId.phoneNumber.value || anyId.phoneNumber };
            }
            if (anyId.phoneNumber && typeof anyId.phoneNumber === 'string') {
                return { phoneNumber: anyId.phoneNumber };
            }
            if (anyId.id && typeof anyId.id === 'string') {
                return { communicationUserId: anyId.id };
            }
        }
        return null;
    }
    async handleCallConnected(callConnectionId) {
        this.logger.log(`Call connected: ${callConnectionId}`);
        this.updateCallState(callConnectionId, 'connected');
    }
    async handleCallDisconnected(callConnectionId) {
        this.logger.log(`Call disconnected: ${callConnectionId}`);
        this.updateCallState(callConnectionId, 'disconnected');
        this.activeCalls.delete(callConnectionId);
        this.callConnections.delete(callConnectionId);
    }
    updateCallState(serverCallId, state) {
        const callSession = this.activeCalls.get(serverCallId);
        if (callSession) {
            callSession.state = state;
            if (state === 'disconnected') {
                callSession.endTime = new Date();
            }
        }
    }
    async rejectCall(incomingCallContext) {
        try {
            await this.callAutomationClient.rejectCall(incomingCallContext);
            this.logger.log('Call rejected successfully');
        }
        catch (error) {
            this.logger.error('Failed to reject call:', error);
            throw error;
        }
    }
    async hangUpCall(serverCallId) {
        const callConnection = this.callConnections.get(serverCallId);
        if (!callConnection) {
            this.logger.warn(`Call connection not found for ${serverCallId}`);
            return;
        }
        try {
            await callConnection.hangUp(true);
            this.logger.log(`Call hung up: ${serverCallId}`);
        }
        catch (error) {
            this.logger.error(`Failed to hang up call ${serverCallId}:`, error);
            throw error;
        }
    }
    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }
    getCallSession(serverCallId) {
        return this.activeCalls.get(serverCallId);
    }
    getCallStats() {
        const activeCalls = this.getActiveCalls();
        return {
            totalActiveCalls: activeCalls.length,
            callsByState: {
                incoming: activeCalls.filter((c) => c.state === 'incoming').length,
                answered: activeCalls.filter((c) => c.state === 'answered').length,
                connected: activeCalls.filter((c) => c.state === 'connected').length,
                disconnected: activeCalls.filter((c) => c.state === 'disconnected').length,
            },
            activeCalls: activeCalls.map((call) => ({
                callConnectionId: call.callConnectionId,
                state: call.state,
                startTime: call.startTime,
                duration: call.endTime
                    ? call.endTime.getTime() - call.startTime.getTime()
                    : Date.now() - call.startTime.getTime(),
            })),
        };
    }
    createMediaStreamingConfig(baseUrl, serverCallId) {
        const wsUrl = baseUrl.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:');
        const audioStreamingUrl = `${wsUrl}/ws?serverCallId=${serverCallId}`;
        return {
            transportUrl: audioStreamingUrl,
            transportType: 'websocket',
            contentType: 'audio',
            audioChannelType: 'unmixed',
            enableBidirectional: call_events_types_1.DEFAULT_MEDIA_STREAMING_CONFIG.enableBidirectional,
            audioFormat: 'Pcm24KMono',
            startMediaStreaming: false,
        };
    }
    async startAudioStreaming(serverCallId) {
        const callConnection = this.callConnections.get(serverCallId);
        const audioSession = this.audioStreamingSessions.get(serverCallId);
        if (!callConnection || !audioSession || audioSession.isStreaming)
            return;
        try {
            this.logger.log(`Starting audio streaming for call ${serverCallId}`);
            const callMedia = callConnection.getCallMedia();
            const startOptions = {
                operationContext: `startMediaStreaming_${serverCallId}`,
            };
            await callMedia.startMediaStreaming(startOptions);
            audioSession.isStreaming = true;
            audioSession.startTime = new Date();
            this.logger.log(`Audio streaming started successfully for call ${serverCallId}`);
        }
        catch (error) {
            this.logger.error(`Failed to start audio streaming for call ${serverCallId}:`, error);
        }
    }
    async stopAudioStreaming(serverCallId) {
        const callConnection = this.callConnections.get(serverCallId);
        const audioSession = this.audioStreamingSessions.get(serverCallId);
        if (!callConnection || !audioSession || !audioSession.isStreaming)
            return;
        try {
            this.logger.log(`Stopping audio streaming for call ${serverCallId}`);
            const callMedia = callConnection.getCallMedia();
            const stopOptions = {
                operationContext: `stopMediaStreaming_${serverCallId}`,
            };
            await callMedia.stopMediaStreaming(stopOptions);
            audioSession.isStreaming = false;
            audioSession.endTime = new Date();
            this.logger.log(`Audio streaming stopped for call ${serverCallId}`);
        }
        catch (error) {
            this.logger.error(`Failed to stop audio streaming for call ${serverCallId}:`, error);
        }
    }
    async handleMediaStreamingStarted(serverCallId) {
        const audioSession = this.audioStreamingSessions.get(serverCallId);
        if (audioSession) {
            audioSession.isStreaming = true;
            audioSession.startTime = new Date();
        }
    }
    async handleMediaStreamingStopped(serverCallId) {
        const audioSession = this.audioStreamingSessions.get(serverCallId);
        if (audioSession) {
            audioSession.isStreaming = false;
            audioSession.endTime = new Date();
        }
    }
    generateAcsAuthHeader(method, url, body) {
        const date = new Date().toUTCString();
        const contentHash = crypto.createHash('sha256').update(body).digest('base64');
        const parsedUrl = new URL(url);
        const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
        const stringToSign = `${method}\n${pathAndQuery}\n${date};${parsedUrl.host};${contentHash}`;
        const signature = crypto.createHmac('sha256', Buffer.from(this.acsAccessKey, 'base64'))
            .update(stringToSign)
            .digest('base64');
        return {
            'x-ms-date': date,
            'x-ms-content-sha256': contentHash,
            'Authorization': `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
            'Content-Type': 'application/json',
        };
    }
    async joinTeamsMeeting(teamsLink, displayName) {
        try {
            this.logger.log(`Joining Teams meeting: ${teamsLink}`);
            const baseUrl = this.configService.get('BASE_URL', 'http://localhost:3000');
            const botDisplayName = displayName || this.configService.get('ACS_DISPLAY_NAME', 'Project Manager AI');
            const serverCallId = `teams-meeting-${Date.now()}`;
            const mediaStreamingConfig = this.createMediaStreamingConfig(baseUrl, serverCallId);
            this.logger.log(`Using display name: ${botDisplayName}`);
            this.logger.log(`Callback URL: ${baseUrl}/acs/events`);
            const callbackUri = `${baseUrl}/acs/events`;
            const apiUrl = `${this.acsEndpoint}calling/callConnections?api-version=2024-09-15`;
            const requestBody = {
                callbackUri: callbackUri,
                sourceDisplayName: botDisplayName,
                mediaStreamingConfiguration: {
                    transportUrl: mediaStreamingConfig.transportUrl,
                    transportType: mediaStreamingConfig.transportType,
                    contentType: mediaStreamingConfig.contentType,
                    audioChannelType: mediaStreamingConfig.audioChannelType,
                },
                meetingLocator: {
                    kind: 'teamsMeetingLink',
                    teamsMeetingLink: teamsLink,
                },
            };
            const bodyString = JSON.stringify(requestBody);
            this.logger.log(`Request body: ${bodyString}`);
            const headers = this.generateAcsAuthHeader('POST', apiUrl, bodyString);
            const response = await axios_1.default.post(apiUrl, requestBody, { headers });
            this.logger.log(`ACS API response:`, response.data);
            const callConnectionId = response.data.callConnectionId;
            const callSession = {
                callConnectionId: callConnectionId,
                serverCallId: serverCallId,
                correlationId: serverCallId,
                incomingCallContext: teamsLink,
                state: 'answered',
                startTime: new Date(),
                participants: [],
            };
            this.activeCalls.set(serverCallId, callSession);
            const audioSession = {
                serverCallId,
                callConnectionId: callConnectionId,
                isStreaming: false,
            };
            this.audioStreamingSessions.set(serverCallId, audioSession);
            this.logger.log(`Successfully joined Teams meeting. CallConnectionId: ${callConnectionId}`);
            return { success: true, callConnectionId, serverCallId };
        }
        catch (error) {
            this.logger.error(`Failed to join Teams meeting:`, error);
            if (error.response) {
                this.logger.error(`Response status: ${error.response.status}`);
                this.logger.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
            }
            return { success: false, error: error.message || 'Failed to join Teams meeting' };
        }
    }
};
exports.CallAutomationService = CallAutomationService;
exports.CallAutomationService = CallAutomationService = CallAutomationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        websocket_service_1.WebSocketService])
], CallAutomationService);
//# sourceMappingURL=call-automation.service.js.map