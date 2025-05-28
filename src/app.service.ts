import { Injectable } from '@nestjs/common';
import { WebSocketService } from './websocket/websocket.service';
import { CallAutomationService } from './call-automation/call-automation.service';

@Injectable()
export class AppService {
  constructor(
    private readonly webSocketService: WebSocketService,
    private readonly callAutomationService: CallAutomationService,
  ) {}

  // Get ACS audio streaming statistics
  getAcsStreamingStats() {
    return this.webSocketService.getAcsStreamingStats();
  }

  // Send audio data to ACS client
  sendAudioToAcsClient(clientId: string, audioData: string): boolean {
    return this.webSocketService.sendAudioToAcsClient(clientId, audioData);
  }

  // Stop audio for ACS client
  stopAudioForAcsClient(clientId: string): boolean {
    return this.webSocketService.stopAudioForAcsClient(clientId);
  }

  // Get call automation statistics
  getCallStats() {
    return this.callAutomationService.getCallStats();
  }

  // Get active calls
  getActiveCalls() {
    return this.callAutomationService.getActiveCalls();
  }

  // Send DTMF tone to specific call
  async sendToneToCall(
    callConnectionId: string,
    tone: string = '1',
    waitTimeMs: number = 3500,
  ) {
    return this.callAutomationService.sendAudioTone(callConnectionId, {
      tone,
      waitTimeMs,
    });
  }

  // Hang up specific call
  async hangUpCall(callConnectionId: string) {
    return this.callAutomationService.hangUpCall(callConnectionId);
  }
}
