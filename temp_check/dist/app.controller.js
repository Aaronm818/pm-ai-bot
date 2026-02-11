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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const fs_1 = require("fs");
const path_1 = require("path");
const fs_2 = require("fs");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
    }
    getAcsStreamingStats() {
        return this.appService.getAcsStreamingStats();
    }
    sendAudioToClient(clientId, body) {
        const success = this.appService.sendAudioToAcsClient(clientId, body.audioData);
        return {
            success,
            message: success
                ? `Audio sent to ACS client ${clientId}`
                : `Failed to send audio to client ${clientId} (client not found or not ACS client)`,
        };
    }
    stopAudioForClient(clientId) {
        const success = this.appService.stopAudioForAcsClient(clientId);
        return {
            success,
            message: success
                ? `Stop audio sent to ACS client ${clientId}`
                : `Failed to stop audio for client ${clientId} (client not found or not ACS client)`,
        };
    }
    getCallStats() {
        return this.appService.getCallStats();
    }
    getActiveCalls() {
        return this.appService.getActiveCalls();
    }
    async sendToneToCall(callConnectionId, body) {
        const tone = body.tone || '1';
        const waitTimeMs = Number(body.waitTimeMs) || 3500;
        try {
            await this.appService.sendToneToCall(callConnectionId, tone, waitTimeMs);
            return {
                success: true,
                message: `Sent DTMF tone "${tone}" to call ${callConnectionId}`,
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Failed to send tone to call ${callConnectionId}: ${error.message}`,
            };
        }
    }
    async sendTextToSpeechToCall(callConnectionId, body) {
        const text = body.text || 'Hello, this is a test message from Azure Communication Services.';
        const voice = body.voice || 'en-US-JennyNeural';
        const language = body.language || 'en-US';
        const waitTimeMs = Number(body.waitTimeMs) || 3500;
        try {
            await this.appService.sendTextToSpeechToCall(callConnectionId, text, voice, language, waitTimeMs);
            return {
                success: true,
                message: `Sent text-to-speech to call ${callConnectionId}: "${text}"`,
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Failed to send text-to-speech to call ${callConnectionId}: ${error.message}`,
            };
        }
    }
    async hangUpCall(callConnectionId) {
        try {
            await this.appService.hangUpCall(callConnectionId);
            return {
                success: true,
                message: `Hung up call ${callConnectionId}`,
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Failed to hang up call ${callConnectionId}: ${error.message}`,
            };
        }
    }
    async joinTeamsMeeting(body) {
        if (!body.teamsLink) {
            return {
                success: false,
                error: 'teamsLink is required',
            };
        }
        return this.appService.joinTeamsMeeting(body.teamsLink, body.displayName);
    }
    getRecordings() {
        try {
            const recordingsPath = (0, path_1.join)(process.cwd(), 'recordings');
            const files = (0, fs_2.readdirSync)(recordingsPath);
            const recordings = files
                .filter(file => file.endsWith('.wav'))
                .map(file => {
                const filePath = (0, path_1.join)(recordingsPath, file);
                const stats = (0, fs_2.statSync)(filePath);
                return {
                    name: file,
                    path: `/recordings/${file}`,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
                .sort((a, b) => b.modified.getTime() - a.modified.getTime());
            return { recordings };
        }
        catch (error) {
            return { recordings: [], error: error.message };
        }
    }
    getRecordingFile(filename, res) {
        try {
            const recordingsPath = (0, path_1.join)(process.cwd(), 'recordings');
            const filePath = (0, path_1.join)(recordingsPath, filename);
            if (!filePath.startsWith(recordingsPath)) {
                res.status(403);
                return { error: 'Access denied' };
            }
            const file = (0, fs_1.createReadStream)(filePath);
            res.set({
                'Content-Type': 'audio/wav',
                'Content-Disposition': `inline; filename="${filename}"`,
            });
            return new common_1.StreamableFile(file);
        }
        catch (error) {
            res.status(404);
            return { error: 'File not found' };
        }
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)('acs/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getAcsStreamingStats", null);
__decorate([
    (0, common_1.Post)('acs/audio/:clientId'),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "sendAudioToClient", null);
__decorate([
    (0, common_1.Post)('acs/stop-audio/:clientId'),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "stopAudioForClient", null);
__decorate([
    (0, common_1.Get)('calls/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getCallStats", null);
__decorate([
    (0, common_1.Get)('calls/active'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getActiveCalls", null);
__decorate([
    (0, common_1.Post)('calls/:callConnectionId/tone'),
    __param(0, (0, common_1.Param)('callConnectionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "sendToneToCall", null);
__decorate([
    (0, common_1.Post)('calls/:callConnectionId/tts'),
    __param(0, (0, common_1.Param)('callConnectionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "sendTextToSpeechToCall", null);
__decorate([
    (0, common_1.Post)('calls/:callConnectionId/hangup'),
    __param(0, (0, common_1.Param)('callConnectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "hangUpCall", null);
__decorate([
    (0, common_1.Post)('calls/join-teams-meeting'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "joinTeamsMeeting", null);
__decorate([
    (0, common_1.Get)('recordings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getRecordings", null);
__decorate([
    (0, common_1.Get)('recordings/:filename'),
    __param(0, (0, common_1.Param)('filename')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getRecordingFile", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map