import { Injectable, Logger } from '@nestjs/common';
import {
  AudioMetadata,
  AudioData,
  AudioSession,
  AudioProcessingResult,
  OutboundAudioData,
  StopAudioMessage,
} from './audio-streaming.types';

@Injectable()
export class AudioStreamingService {
  private readonly logger = new Logger(AudioStreamingService.name);
  private audioSessions: Map<string, AudioSession> = new Map();

  // Process incoming audio metadata
  processAudioMetadata(
    metadata: AudioMetadata,
    sessionId: string,
  ): AudioSession {
    this.logger.log(`Received audio metadata for session ${sessionId}:`, {
      subscriptionId: metadata.subscriptionId,
      encoding: metadata.encoding,
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
      length: metadata.length,
    });

    const session: AudioSession = {
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

  async processAudioData(
    audioData: AudioData,
    sessionId: string,
  ): Promise<AudioProcessingResult> {
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
      const processedAudio = await this.processAudioBuffer(
        audioData.data,
        session.metadata,
        sessionId,
      );
      return { processedData: processedAudio };
    } catch (error) {
      this.logger.error('Error processing audio data:', error);
      return { error: error.message };
    }
  }

  // Create outbound audio data message for ACS
  createOutboundAudioData(audioData: string): OutboundAudioData {
    return {
      Kind: 'AudioData',
      AudioData: {
        Data: audioData,
      },
      StopAudio: null,
    };
  }

  // Create stop audio message for ACS
  createStopAudioMessage(): StopAudioMessage {
    return {
      Kind: 'StopAudio',
      AudioData: null,
      StopAudio: {},
    };
  }

  // Get session information
  getAudioSession(sessionId: string): AudioSession | undefined {
    return this.audioSessions.get(sessionId);
  }

  // Get all active sessions
  getActiveSessions(): AudioSession[] {
    return Array.from(this.audioSessions.values()).filter(
      (session) => session.isActive,
    );
  }

  // End audio session
  endAudioSession(sessionId: string): boolean {
    const session = this.audioSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.audioSessions.delete(sessionId);
      this.logger.log(`Audio session ${sessionId} ended`);
      return true;
    }
    return false;
  }

  // Clean up inactive sessions (call periodically)
  cleanupInactiveSessions(maxInactiveMinutes: number = 30): number {
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

  private async processAudioBuffer(
    base64AudioData: string,
    metadata: AudioMetadata | undefined,
    sessionId: string,
  ): Promise<string> {
    try {
      const audioBuffer = Buffer.from(base64AudioData, 'base64');

      const fs = await import('fs');
      const path = await import('path');

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
    } catch (error) {
      this.logger.error('Error in audio processing:', error);
      throw error;
    }
  }

  // Validate audio metadata
  validateAudioMetadata(metadata: AudioMetadata): boolean {
    const validEncodings = ['PCM'];
    const validSampleRates = [16000, 24000];
    const validChannels = [1]; // Mono only

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

  // Get session statistics
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
}
