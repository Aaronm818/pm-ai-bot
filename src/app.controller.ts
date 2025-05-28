import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AppService } from './app.service';

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
}
