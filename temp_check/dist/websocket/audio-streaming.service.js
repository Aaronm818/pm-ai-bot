"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AudioStreamingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioStreamingService = void 0;
const common_1 = require("@nestjs/common");
let AudioStreamingService = AudioStreamingService_1 = class AudioStreamingService {
    constructor() {
        this.logger = new common_1.Logger(AudioStreamingService_1.name);
        this.audioSessions = new Map();
    }
    processAudioMetadata(metadata, sessionId) {
        this.logger.log(`Received audio metadata for session ${sessionId}:`, {
            subscriptionId: metadata.subscriptionId,
            encoding: metadata.encoding,
            sampleRate: metadata.sampleRate,
            channels: metadata.channels,
            length: metadata.length,
        });
        const session = {
            sessionId,
            subscriptionId: metadata.subscriptionId,
            metadata,
            isActive: true,
            startTime: new Date(),
            lastActivity: new Date(),
        };
        this.audioSessions.set(sessionId, session);
        return session;
    }
    async processAudioData(audioData, sessionId) {
        const session = this.audioSessions.get(sessionId);
        if (!session) {
            return { error: 'No active audio session' };
        }
        session.lastActivity = new Date();
        session.participantId = audioData.participantRawID;
        if (audioData.silent) {
            return { processedData: audioData.data };
        }
        try {
            const processedAudio = await this.processAudioBuffer(audioData.data, session.metadata, sessionId);
            return { processedData: processedAudio };
        }
        catch (error) {
            this.logger.error('Error processing audio data:', error);
            return { error: error.message };
        }
    }
    createOutboundAudioData(audioData) {
        return {
            Kind: 'AudioData',
            AudioData: {
                Data: audioData,
            },
            StopAudio: null,
        };
    }
    createStopAudioMessage() {
        return {
            Kind: 'StopAudio',
            AudioData: null,
            StopAudio: {},
        };
    }
    getAudioSession(sessionId) {
        return this.audioSessions.get(sessionId);
    }
    getActiveSessions() {
        return Array.from(this.audioSessions.values()).filter((session) => session.isActive);
    }
    endAudioSession(sessionId) {
        const session = this.audioSessions.get(sessionId);
        if (session) {
            session.isActive = false;
            this.audioSessions.delete(sessionId);
            this.logger.log(`Audio session ${sessionId} ended`);
            return true;
        }
        return false;
    }
    cleanupInactiveSessions(maxInactiveMinutes = 30) {
        const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
        let cleanedCount = 0;
        for (const [sessionId, session] of this.audioSessions.entries()) {
            if (session.lastActivity < cutoffTime) {
                this.endAudioSession(sessionId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.logger.log(`Cleaned up ${cleanedCount} inactive audio sessions`);
        }
        return cleanedCount;
    }
    async processAudioBuffer(base64AudioData, metadata, sessionId) {
        try {
            const audioBuffer = Buffer.from(base64AudioData, 'base64');
            const fs = await Promise.resolve().then(() => require('fs'));
            const path = await Promise.resolve().then(() => require('path'));
            const wavDir = path.join(process.cwd(), 'recordings');
            if (!fs.existsSync(wavDir)) {
                fs.mkdirSync(wavDir, { recursive: true });
            }
            const wavFilePath = path.join(wavDir, `${sessionId}.wav`);
            if (!fs.existsSync(wavFilePath)) {
                const sampleRate = metadata?.sampleRate ?? 16000;
                const numChannels = metadata?.channels ?? 1;
                const bitsPerSample = 16;
                const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
                const blockAlign = (numChannels * bitsPerSample) / 8;
                const dataLength = 0;
                const header = Buffer.alloc(44);
                header.write('RIFF', 0);
                header.writeUInt32LE(36 + dataLength, 4);
                header.write('WAVE', 8);
                header.write('fmt ', 12);
                header.writeUInt32LE(16, 16);
                header.writeUInt16LE(1, 20);
                header.writeUInt16LE(numChannels, 22);
                header.writeUInt32LE(sampleRate, 24);
                header.writeUInt32LE(byteRate, 28);
                header.writeUInt16LE(blockAlign, 32);
                header.writeUInt16LE(bitsPerSample, 34);
                header.write('data', 36);
                header.writeUInt32LE(dataLength, 40);
                fs.writeFileSync(wavFilePath, header);
            }
            fs.appendFileSync(wavFilePath, audioBuffer);
            return base64AudioData;
        }
        catch (error) {
            this.logger.error('Error in audio processing:', error);
            throw error;
        }
    }
    validateAudioMetadata(metadata) {
        const validEncodings = ['PCM'];
        const validSampleRates = [16000, 24000];
        const validChannels = [1];
        if (!validEncodings.includes(metadata.encoding)) {
            this.logger.warn(`Unsupported encoding: ${metadata.encoding}`);
            return false;
        }
        if (!validSampleRates.includes(metadata.sampleRate)) {
            this.logger.warn(`Unsupported sample rate: ${metadata.sampleRate}`);
            return false;
        }
        if (!validChannels.includes(metadata.channels)) {
            this.logger.warn(`Unsupported channel count: ${metadata.channels}`);
            return false;
        }
        return true;
    }
    getSessionStats() {
        const sessions = Array.from(this.audioSessions.values());
        const activeSessions = sessions.filter((s) => s.isActive);
        return {
            totalSessions: sessions.length,
            activeSessions: activeSessions.length,
            sessions: activeSessions.map((session) => ({
                sessionId: session.sessionId,
                participantId: session.participantId,
                subscriptionId: session.subscriptionId,
                startTime: session.startTime,
                lastActivity: session.lastActivity,
                duration: Date.now() - session.startTime.getTime(),
                sampleRate: session.metadata?.sampleRate,
                encoding: session.metadata?.encoding,
            })),
        };
    }
};
exports.AudioStreamingService = AudioStreamingService;
exports.AudioStreamingService = AudioStreamingService = AudioStreamingService_1 = __decorate([
    (0, common_1.Injectable)()
], AudioStreamingService);
//# sourceMappingURL=audio-streaming.service.js.map