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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CallAutomationController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallAutomationController = void 0;
const common_1 = require("@nestjs/common");
const call_automation_service_1 = require("./call-automation.service");
const websocket_service_1 = require("../websocket/websocket.service");
const communication_identity_1 = require("@azure/communication-identity");
const call_events_types_1 = require("./call-events.types");
let CallAutomationController = CallAutomationController_1 = class CallAutomationController {
    constructor(callAutomationService, webSocketService) {
        this.callAutomationService = callAutomationService;
        this.webSocketService = webSocketService;
        this.logger = new common_1.Logger(CallAutomationController_1.name);
        const connectionString = process.env.ACS_CONNECTION_STRING;
        if (!connectionString) {
            this.logger.error('ACS_CONNECTION_STRING not set - token endpoint will fail');
        }
        this.identityClient = new communication_identity_1.CommunicationIdentityClient(connectionString || '');
    }
    async getToken() {
        this.logger.log('Generating ACS token for browser client');
        try {
            const user = await this.identityClient.createUser();
            const tokenResponse = await this.identityClient.getToken(user, ['voip']);
            this.logger.log(`Token generated for user: ${user.communicationUserId}`);
            return {
                token: tokenResponse.token,
                expiresOn: tokenResponse.expiresOn,
                userId: user.communicationUserId,
            };
        }
        catch (error) {
            this.logger.error('Failed to generate ACS token:', error);
            throw new common_1.BadRequestException('Failed to generate token');
        }
    }
    async handleEventGridEvents(events) {
        this.logger.log(`Received ${events.length} EventGrid event(s)`);
        const validationEvent = events.find((event) => event.eventType === call_events_types_1.EVENTGRID_EVENT_TYPES.SUBSCRIPTION_VALIDATION ||
            event.type === call_events_types_1.EVENTGRID_EVENT_TYPES.SUBSCRIPTION_VALIDATION);
        if (validationEvent) {
            return this.handleSubscriptionValidation(validationEvent);
        }
        for (const event of events) {
            try {
                await this.processEvent(event);
            }
            catch (error) {
                this.logger.error(`Failed to process event ${event.id}:`, error);
            }
        }
        return { message: `Processed ${events.length} events` };
    }
    handleSubscriptionValidation(event) {
        this.logger.log('EventGrid subscription validation');
        const validationData = event.data;
        if (!validationData.validationCode) {
            throw new common_1.BadRequestException('Validation code missing');
        }
        return {
            validationResponse: validationData.validationCode,
        };
    }
    async processEvent(event) {
        const eventType = event.eventType || event.type;
        if (!eventType) {
            this.logger.warn('Event received with missing eventType');
            return;
        }
        switch (eventType) {
            case call_events_types_1.ACS_EVENT_TYPES.INCOMING_CALL:
                await this.handleIncomingCall(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.CALL_CONNECTED:
                await this.handleCallConnected(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.CALL_DISCONNECTED:
                await this.handleCallDisconnected(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.PARTICIPANTS_UPDATED:
                await this.handleParticipantsUpdated(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.MEDIA_STREAMING_STARTED:
                await this.handleMediaStreamingStarted(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.MEDIA_STREAMING_STOPPED:
                await this.handleMediaStreamingStopped(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.DTMF_RECEIVED:
                await this.handleDtmfReceived(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.PLAY_COMPLETED:
                await this.handlePlayCompleted(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.RECORDING_FILE_STATUS_UPDATED:
                await this.handleRecordingFileStatusUpdated(event.data);
                break;
            case call_events_types_1.ACS_EVENT_TYPES.PLAY_STARTED:
            case call_events_types_1.ACS_EVENT_TYPES.PLAY_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.PLAY_CANCELED:
            case call_events_types_1.ACS_EVENT_TYPES.RECOGNIZE_COMPLETED:
            case call_events_types_1.ACS_EVENT_TYPES.RECOGNIZE_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.RECOGNIZE_CANCELED:
            case call_events_types_1.ACS_EVENT_TYPES.CONTINUOUS_DTMF_RECOGNITION_TONE_RECEIVED:
            case call_events_types_1.ACS_EVENT_TYPES.CONTINUOUS_DTMF_RECOGNITION_TONE_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.CONTINUOUS_DTMF_RECOGNITION_STOPPED:
            case call_events_types_1.ACS_EVENT_TYPES.SEND_DTMF_TONES_COMPLETED:
            case call_events_types_1.ACS_EVENT_TYPES.SEND_DTMF_TONES_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.ADD_PARTICIPANT_SUCCEEDED:
            case call_events_types_1.ACS_EVENT_TYPES.ADD_PARTICIPANT_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.REMOVE_PARTICIPANT_SUCCEEDED:
            case call_events_types_1.ACS_EVENT_TYPES.REMOVE_PARTICIPANT_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.CALL_TRANSFER_ACCEPTED:
            case call_events_types_1.ACS_EVENT_TYPES.CALL_TRANSFER_FAILED:
            case call_events_types_1.ACS_EVENT_TYPES.RECORDING_STATE_CHANGED:
                this.logger.log(`📋 ACS EVENT: ${event.eventType}`, {
                    eventType: event.eventType,
                    callConnectionId: event.data?.callConnectionId,
                    serverCallId: event.data?.serverCallId,
                    correlationId: event.data?.correlationId,
                    data: event.data,
                });
                break;
            default:
                this.logger.warn(`Unknown ACS event type: "${eventType}"`);
                break;
        }
    }
    async handleIncomingCall(eventData) {
        this.logger.log(`Incoming call: ${eventData.serverCallId}`);
        await this.callAutomationService.handleIncomingCall(eventData);
    }
    async handleCallConnected(eventData) {
        this.logger.log(`Call connected: ${eventData.serverCallId}`);
        await this.callAutomationService.handleCallConnected(eventData.callConnectionId);
    }
    async handleCallDisconnected(eventData) {
        this.logger.log(`Call disconnected: ${eventData.serverCallId}`);
        await this.callAutomationService.handleCallDisconnected(eventData.serverCallId);
    }
    async handleParticipantsUpdated(eventData) {
        this.logger.log(`Participants updated: ${eventData.participants.length} participants`);
    }
    async handleMediaStreamingStarted(eventData) {
        this.logger.log(`Media streaming started: ${eventData.serverCallId}`);
    }
    async handleMediaStreamingStopped(eventData) {
        this.logger.log(`Media streaming stopped: ${eventData.serverCallId}`);
    }
    async handleDtmfReceived(eventData) {
        this.logger.log(`DTMF received: ${eventData.toneInfo.tone}`);
    }
    async handlePlayCompleted(_eventData) {
        this.logger.log('Audio playback completed');
    }
    async handleRecordingFileStatusUpdated(eventData) {
        this.logger.log(`Recording updated: ${eventData.recordingStorageInfo.recordingChunks.length} chunks`);
    }
    async sendTestTone(callConnectionId, body) {
        const toneConfig = {
            tone: body.tone || '1',
            waitTimeMs: body.waitTimeMs || 3500,
        };
        await this.callAutomationService.sendAudioTone(callConnectionId, toneConfig);
        return {
            message: `Sent DTMF tone "${toneConfig.tone}" to call ${callConnectionId}`,
            toneConfig,
        };
    }
    async sendTestTextToSpeech(callConnectionId, body) {
        const ttsConfig = {
            text: body.text || 'Hello, this is a test message from Azure Communication Services.',
            voice: body.voice || 'en-US-JennyNeural',
            language: body.language || 'en-US',
            waitTimeMs: body.waitTimeMs || 3500,
        };
        await this.callAutomationService.sendTextToSpeech(callConnectionId, ttsConfig);
        return {
            message: `Sent text-to-speech to call ${callConnectionId}: "${ttsConfig.text}"`,
            ttsConfig,
        };
    }
    async hangUpCall(callConnectionId) {
        await this.callAutomationService.hangUpCall(callConnectionId);
        return { message: `Hung up call ${callConnectionId}` };
    }
};
exports.CallAutomationController = CallAutomationController;
__decorate([
    (0, common_1.Get)('token'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CallAutomationController.prototype, "getToken", null);
__decorate([
    (0, common_1.Post)('events'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], CallAutomationController.prototype, "handleEventGridEvents", null);
__decorate([
    (0, common_1.Post)('test/send-tone/:callConnectionId'),
    __param(0, (0, common_1.Param)('callConnectionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CallAutomationController.prototype, "sendTestTone", null);
__decorate([
    (0, common_1.Post)('test/send-tts/:callConnectionId'),
    __param(0, (0, common_1.Param)('callConnectionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CallAutomationController.prototype, "sendTestTextToSpeech", null);
__decorate([
    (0, common_1.Post)('test/hangup/:callConnectionId'),
    __param(0, (0, common_1.Param)('callConnectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CallAutomationController.prototype, "hangUpCall", null);
exports.CallAutomationController = CallAutomationController = CallAutomationController_1 = __decorate([
    (0, common_1.Controller)('acs'),
    __metadata("design:paramtypes", [call_automation_service_1.CallAutomationService,
        websocket_service_1.WebSocketService])
], CallAutomationController);
//# sourceMappingURL=call-automation.controller.js.map