import { Controller, Get, Post, Body, Param, Res, StreamableFile } from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('acs/stats')
  getAcsStreamingStats() {
    return this.appService.getAcsStreamingStats();
  }

  @Post('acs/audio/:clientId')
  sendAudioToClient(
    @Param('clientId') clientId: string,
    @Body() body: { audioData: string },
  ) {
    const success = this.appService.sendAudioToAcsClient(
      clientId,
      body.audioData,
    );
    return {
      success,
      message: success
        ? `Audio sent to ACS client ${clientId}`
        : `Failed to send audio to client ${clientId} (client not found or not ACS client)`,
    };
  }

  @Post('acs/stop-audio/:clientId')
  stopAudioForClient(@Param('clientId') clientId: string) {
    const success = this.appService.stopAudioForAcsClient(clientId);
    return {
      success,
      message: success
        ? `Stop audio sent to ACS client ${clientId}`
        : `Failed to stop audio for client ${clientId} (client not found or not ACS client)`,
    };
  }

  // Call Automation Endpoints

  @Get('calls/stats')
  getCallStats() {
    return this.appService.getCallStats();
  }

  @Get('calls/active')
  getActiveCalls() {
    return this.appService.getActiveCalls();
  }

  @Post('calls/:callConnectionId/tone')
  async sendToneToCall(
    @Param('callConnectionId') callConnectionId: string,
    @Body() body: { tone?: string; waitTimeMs?: number },
  ) {
    const tone = body.tone || '1';
    const waitTimeMs = Number(body.waitTimeMs) || 3500;

    try {
      await this.appService.sendToneToCall(callConnectionId, tone, waitTimeMs);
      return {
        success: true,
        message: `Sent DTMF tone "${tone}" to call ${callConnectionId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send tone to call ${callConnectionId}: ${error.message}`,
      };
    }
  }

  @Post('calls/:callConnectionId/tts')
  async sendTextToSpeechToCall(
    @Param('callConnectionId') callConnectionId: string,
    @Body() body: { text?: string; voice?: string; language?: string; waitTimeMs?: number },
  ) {
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
    } catch (error) {
      return {
        success: false,
        message: `Failed to send text-to-speech to call ${callConnectionId}: ${error.message}`,
      };
    }
  }

  @Post('calls/:callConnectionId/hangup')
  async hangUpCall(@Param('callConnectionId') callConnectionId: string) {
    try {
      await this.appService.hangUpCall(callConnectionId);
      return {
        success: true,
        message: `Hung up call ${callConnectionId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to hang up call ${callConnectionId}: ${error.message}`,
      };
    }
  }

  // Join Teams Meeting Endpoint
  @Post('calls/join-teams-meeting')
  async joinTeamsMeeting(
    @Body() body: { teamsLink: string; displayName?: string },
  ) {
    if (!body.teamsLink) {
      return {
        success: false,
        error: 'teamsLink is required',
      };
    }

    return this.appService.joinTeamsMeeting(body.teamsLink, body.displayName);
  }

  // Recording Endpoints

  @Get('recordings')
  getRecordings() {
    try {
      const recordingsPath = join(process.cwd(), 'recordings');
      const files = readdirSync(recordingsPath);

      const recordings = files
        .filter(file => file.endsWith('.wav'))
        .map(file => {
          const filePath = join(recordingsPath, file);
          const stats = statSync(filePath);
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
    } catch (error) {
      return { recordings: [], error: error.message };
    }
  }

  @Get('recordings/:filename')
  getRecordingFile(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response) {
    try {
      const recordingsPath = join(process.cwd(), 'recordings');
      const filePath = join(recordingsPath, filename);

      if (!filePath.startsWith(recordingsPath)) {
        res.status(403);
        return { error: 'Access denied' };
      }

      const file = createReadStream(filePath);

      res.set({
        'Content-Type': 'audio/wav',
        'Content-Disposition': `inline; filename="${filename}"`,
      });

      return new StreamableFile(file);
    } catch (error) {
      res.status(404);
      return { error: 'File not found' };
    }
  }
}