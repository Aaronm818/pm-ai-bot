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
var WebSocketService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const common_1 = require("@nestjs/common");
const websocket_gateway_1 = require("./websocket.gateway");
const audio_streaming_service_1 = require("./audio-streaming.service");
let WebSocketService = WebSocketService_1 = class WebSocketService {
    constructor(webSocketGateway, audioStreamingService) {
        this.webSocketGateway = webSocketGateway;
        this.audioStreamingService = audioStreamingService;
        this.logger = new common_1.Logger(WebSocketService_1.name);
    }
    getConnectedAcsClients() {
        return this.webSocketGateway.getConnectedAcsClients();
    }
    getAcsClientCount() {
        return this.webSocketGateway.getAcsClientCount();
    }
    getAudioSessionStats() {
        return this.webSocketGateway.getAudioSessionStats();
    }
    sendAudioToAcsClient(clientId, audioData) {
        return this.webSocketGateway.sendAudioToAcsClient(clientId, audioData);
    }
    stopAudioForAcsClient(clientId) {
        return this.webSocketGateway.stopAudioForAcsClient(clientId);
    }
    getAcsStreamingStats() {
        const audioStats = this.getAudioSessionStats();
        return {
            connectedAcsClients: this.getAcsClientCount(),
            connectedClientIds: this.getConnectedAcsClients(),
            audioSessions: audioStats,
            timestamp: new Date().toISOString(),
        };
    }
    broadcastToAllClients(eventType, data) {
        this.webSocketGateway.broadcastToAllClients(eventType, data);
    }
    broadcastAudioData(audioData) {
        this.webSocketGateway.broadcastAudioData(audioData);
    }
    getSessionStats() {
        return this.audioStreamingService.getSessionStats();
    }
    performCleanup() {
        this.webSocketGateway.performCleanup();
    }
};
exports.WebSocketService = WebSocketService;
exports.WebSocketService = WebSocketService = WebSocketService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [websocket_gateway_1.WebSocketGateway,
        audio_streaming_service_1.AudioStreamingService])
], WebSocketService);
//# sourceMappingURL=websocket.service.js.map