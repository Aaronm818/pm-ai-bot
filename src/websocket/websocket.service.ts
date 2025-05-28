import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { AudioStreamingService } from './audio-streaming.service';

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);

  constructor(
    private readonly webSocketGateway: WebSocketGateway,
    private readonly audioStreamingService: AudioStreamingService,
  ) {}

  getConnectedAcsClients(): string[] {
    return this.webSocketGateway.getConnectedAcsClients();
  }

  getAcsClientCount(): number {
    return this.webSocketGateway.getAcsClientCount();
  }

  getAudioSessionStats() {
    return this.webSocketGateway.getAudioSessionStats();
  }

  sendAudioToAcsClient(clientId: string, audioData: string): boolean {
    return this.webSocketGateway.sendAudioToAcsClient(clientId, audioData);
  }

  stopAudioForAcsClient(clientId: string): boolean {
    return this.webSocketGateway.stopAudioForAcsClient(clientId);
  }

  // Get comprehensive ACS audio streaming statistics
  getAcsStreamingStats() {
    const audioStats = this.getAudioSessionStats();

    return {
      connectedAcsClients: this.getAcsClientCount(),
      connectedClientIds: this.getConnectedAcsClients(),
      audioSessions: audioStats,
      timestamp: new Date().toISOString(),
    };
  }

  // Broadcast Teams event to all WebSocket clients
  broadcastToAllClients(eventType: string, data: any): void {
    this.webSocketGateway.broadcastToAllClients(eventType, data);
  }

  // Broadcast processed audio data to WebSocket clients
  broadcastAudioData(audioData: any): void {
    this.webSocketGateway.broadcastAudioData(audioData);
  }

  // Get session statistics (for Teams calling integration)
  getSessionStats() {
    return this.audioStreamingService.getSessionStats();
  }

  // Perform cleanup operations
  performCleanup(): void {
    this.webSocketGateway.performCleanup();
  }
}
