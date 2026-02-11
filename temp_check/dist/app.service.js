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
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const websocket_service_1 = require("./websocket/websocket.service");
const call_automation_service_1 = require("./call-automation/call-automation.service");
let AppService = class AppService {
    constructor(webSocketService, callAutomationService) {
        this.webSocketService = webSocketService;
        this.callAutomationService = callAutomationService;
    }
    getAcsStreamingStats() {
        return this.webSocketService.getAcsStreamingStats();
    }
    sendAudioToAcsClient(clientId, audioData) {
        return this.webSocketService.sendAudioToAcsClient(clientId, audioData);
    }
    stopAudioForAcsClient(clientId) {
        return this.webSocketService.stopAudioForAcsClient(clientId);
    }
    getCallStats() {
        return this.callAutomationService.getCallStats();
    }
    getActiveCalls() {
        return this.callAutomationService.getActiveCalls();
    }
    async sendToneToCall(serverCallId, tone = '1', waitTimeMs = 3500) {
        return this.callAutomationService.sendAudioTone(serverCallId, {
            tone,
            waitTimeMs,
        });
    }
    async hangUpCall(serverCallId) {
        return this.callAutomationService.hangUpCall(serverCallId);
    }
    async sendTextToSpeechToCall(serverCallId, text = 'Hello, this is a test message from Azure Communication Services.', voice = 'en-US-JennyNeural', language = 'en-US', waitTimeMs = 3500) {
        return this.callAutomationService.sendTextToSpeech(serverCallId, {
            text,
            voice,
            language,
            waitTimeMs,
        });
    }
    async joinTeamsMeeting(teamsLink, displayName) {
        return this.callAutomationService.joinTeamsMeeting(teamsLink, displayName);
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [websocket_service_1.WebSocketService,
        call_automation_service_1.CallAutomationService])
], AppService);
//# sourceMappingURL=app.service.js.map