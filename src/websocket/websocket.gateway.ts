import {
  WebSocketGateway as NestWebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import * as WebSocket from 'ws';
import { Logger } from '@nestjs/common';
import { AudioStreamingService } from './audio-streaming.service';
import { AcsStreamingMessage, OutboundMessage } from './audio-streaming.types';
import { IncomingMessage } from 'http';

@NestWebSocketGateway({
  path: '/ws',
  transports: ['websocket'],
})
export class WebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('AcsAudioStreamingGateway');
  private acsClients: Map<WebSocket, string> = new Map(); // Track ACS audio streaming connections
  private clientToServerCallId: Map<WebSocket, string> = new Map(); // Map client to server call ID
  private serverCallIdToClients: Map<string, Set<WebSocket>> = new Map(); // Map server call ID to clients

  constructor(private readonly audioStreamingService: AudioStreamingService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleConnection(client: WebSocket, request: IncomingMessage) {
    const clientId = this.generateClientId();
    
    // Extract server call ID from URL path
    const serverCallId = this.extractServerCallIdFromUrl(request.url);
    
    this.logger.log(`ACS audio streaming client connected: ${clientId}${serverCallId ? ` for server call: ${serverCallId}` : ''}`);

    // Store client mappings
    if (serverCallId) {
      this.clientToServerCallId.set(client, serverCallId);
      
      if (!this.serverCallIdToClients.has(serverCallId)) {
        this.serverCallIdToClients.set(serverCallId, new Set());
      }
      this.serverCallIdToClients.get(serverCallId)!.add(client);
    }

    // Set up raw message handler for ACS audio streaming
    client.on('message', async (data: Buffer) => {
      try {
        await this.handleAcsMessage(client, data, clientId);
      } catch (error) {
        this.logger.error(
          `Error handling ACS message from ${clientId}:`,
          error,
        );
        this.sendErrorToClient(client, error.message);
      }
    });

    // Send welcome message for ACS connection
    client.send(
      JSON.stringify({
        type: 'acs_connection_ready',
        message:
          'Connected - Ready for Azure Communication Services audio streaming',
        clientId: clientId,
        serverCallId: serverCallId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  handleDisconnect(client: WebSocket) {
    const clientId = this.acsClients.get(client);
    const serverCallId = this.clientToServerCallId.get(client);
    
    if (clientId) {
      this.logger.log(`ACS client disconnected: ${clientId}${serverCallId ? ` from server call: ${serverCallId}` : ''}`);

      // Clean up audio session
      this.audioStreamingService.endAudioSession(clientId);
      this.acsClients.delete(client);

      // Clean up server call ID mappings
      if (serverCallId) {
        this.clientToServerCallId.delete(client);
        const clients = this.serverCallIdToClients.get(serverCallId);
        if (clients) {
          clients.delete(client);
          if (clients.size === 0) {
            this.serverCallIdToClients.delete(serverCallId);
          }
        }
      }

      this.logger.log(`ACS audio session ended for ${clientId}`);
    }
  }

  // Handle ACS audio streaming messages
  private async handleAcsMessage(
    client: WebSocket,
    data: Buffer,
    clientId: string,
  ): Promise<void> {
    try {
      // Parse JSON message
      const message = JSON.parse(data.toString('utf8'));

      // Check if this is an ACS streaming message
      if (this.isAcsStreamingMessage(message)) {
        await this.handleAcsStreamingMessage(client, message, clientId);
      } else {
        this.logger.warn(`Non-ACS message received from ${clientId}:`, message);
        this.sendErrorToClient(
          client,
          'Only ACS audio streaming messages are supported',
        );
      }
    } catch (jsonError) {
      this.logger.error(`Invalid JSON message from ${clientId}:`, jsonError);
      this.sendErrorToClient(client, 'Invalid JSON format');
    }
  }

  private async handleAcsStreamingMessage(
    client: WebSocket,
    message: AcsStreamingMessage,
    clientId: string,
  ): Promise<void> {
    if (!this.acsClients.has(client)) {
      this.acsClients.set(client, clientId);
      this.logger.log(`ACS client connected: ${clientId}`);
    }

    try {
      if (message.kind === 'AudioMetadata') {
        await this.handleAudioMetadata(client, message, clientId);
      } else if (message.kind === 'AudioData') {
        await this.handleAudioData(client, message, clientId);
      } else {
        this.logger.warn(
          `Unknown ACS message kind "${message.kind}" from ${clientId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing ACS message from ${clientId}:`,
        error,
      );
      this.sendToAcsClient(client, {
        Kind: 'Error',
        AudioData: null,
        StopAudio: null,
        Error: { message: error.message },
      });
    }
  }

  private async handleAudioMetadata(
    client: WebSocket,
    message: AcsStreamingMessage,
    clientId: string,
  ): Promise<void> {
    if (!message.audioMetadata) {
      throw new Error('Audio metadata is missing');
    }

    if (
      !this.audioStreamingService.validateAudioMetadata(message.audioMetadata)
    ) {
      throw new Error('Invalid audio metadata');
    }

    this.audioStreamingService.processAudioMetadata(
      message.audioMetadata,
      clientId,
    );

    this.logger.log(`Audio session started: ${clientId}`);
  }

  private async handleAudioData(
    client: WebSocket,
    message: AcsStreamingMessage,
    clientId: string,
  ): Promise<void> {
    if (!message.audioData) {
      throw new Error('Audio data is missing');
    }

    const result = await this.audioStreamingService.processAudioData(
      message.audioData,
      clientId,
    );

    if (result.error) {
      throw new Error(result.error);
    }

    if (
      result.processedData &&
      result.processedData !== message.audioData.data
    ) {
      const outboundMessage =
        this.audioStreamingService.createOutboundAudioData(
          result.processedData,
        );
      this.sendToAcsClient(client, outboundMessage);
    }

    if (result.shouldStop) {
      const stopMessage = this.audioStreamingService.createStopAudioMessage();
      this.sendToAcsClient(client, stopMessage);
    }
  }

  // Check if message is from ACS
  private isAcsStreamingMessage(message: any): message is AcsStreamingMessage {
    return (
      message &&
      typeof message.kind === 'string' &&
      (message.kind === 'AudioMetadata' || message.kind === 'AudioData')
    );
  }

  // Send message to ACS client
  private sendToAcsClient(client: WebSocket, message: OutboundMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(message);
      client.send(messageString);
      this.logger.debug('Sent message to ACS:', message.Kind);
    }
  }

  // Send error message to client
  private sendErrorToClient(client: WebSocket, errorMessage: string): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private generateClientId(): string {
    return 'acs_client_' + Math.random().toString(36).substr(2, 9);
  }

  private extractServerCallIdFromUrl(url: string | undefined): string | null {
    if (!url) return null;

    // Try to extract from query string: ?serverCallId=<idHere>
    const queryMatch = url.match(/[?&]serverCallId=([^&]+)/);
    if (queryMatch && queryMatch[1]) {
      return decodeURIComponent(queryMatch[1]);
    }

    // Fallback: Handle both /ws and /ws/<servercallid> patterns
    const pathMatch = url.match(/^\/ws(?:\/([^/?]+))?/);
    return pathMatch && pathMatch[1] ? pathMatch[1] : null;
  }

  // Public methods for service integration

  // Broadcast message to all connected clients
  broadcastToAllClients(eventType: string, data: any): void {
    const message = {
      type: eventType,
      data: data,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all WebSocket clients
    if (this.server?.clients) {
      this.server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });

      this.logger.debug(
        `Broadcasted ${eventType} event to ${this.server.clients.size} clients`,
      );
    }
  }

  // Broadcast audio data to all connected clients
  broadcastAudioData(audioData: any): void {
    const message = {
      type: 'teams-audio-data',
      data: audioData,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all WebSocket clients
    if (this.server?.clients) {
      this.server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });

      this.logger.debug(
        `Broadcasted Teams audio data to ${this.server.clients.size} clients`,
      );
    }
  }

  // Get all connected ACS clients
  getConnectedAcsClients(): string[] {
    return Array.from(this.acsClients.values());
  }

  // Get ACS client count
  getAcsClientCount(): number {
    return this.acsClients.size;
  }

  // Get audio session statistics
  getAudioSessionStats() {
    return this.audioStreamingService.getSessionStats();
  }

  // Send audio data to specific ACS client
  sendAudioToAcsClient(serverCallId: string, audioData: string): boolean {
    const clients = this.serverCallIdToClients.get(serverCallId);
    if (!clients || clients.size === 0) {
      this.logger.warn(`No clients connected for server call ID: ${serverCallId}`);
      return false;
    }

    // Send audio data to all connected clients for the server call ID
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const message = this.audioStreamingService.createOutboundAudioData(audioData);
        this.sendToAcsClient(client, message);
      }
    });

    return true;
  }

  // Stop audio for specific ACS client
  stopAudioForAcsClient(clientId: string): boolean {
    for (const [client, id] of this.acsClients.entries()) {
      if (id === clientId && client.readyState === WebSocket.OPEN) {
        const stopMessage = this.audioStreamingService.createStopAudioMessage();
        this.sendToAcsClient(client, stopMessage);
        return true;
      }
    }
    return false;
  }

  // Cleanup method to be called periodically
  performCleanup(): void {
    this.audioStreamingService.cleanupInactiveSessions();
  }

  // New methods for server call ID management

  // Get all connected clients for a specific server call ID
  getClientsByServerCallId(serverCallId: string): string[] {
    const clients = this.serverCallIdToClients.get(serverCallId);
    if (!clients) return [];
    
    const clientIds: string[] = [];
    for (const client of clients) {
      const clientId = this.acsClients.get(client);
      if (clientId) {
        clientIds.push(clientId);
      }
    }
    return clientIds;
  }

  // Get server call ID for a specific client
  getServerCallIdByClient(clientId: string): string | null {
    for (const [client, id] of this.acsClients.entries()) {
      if (id === clientId) {
        return this.clientToServerCallId.get(client) || null;
      }
    }
    return null;
  }

  // Broadcast message to all clients connected to a specific server call ID
  broadcastToServerCall(serverCallId: string, eventType: string, data: any): void {
    const clients = this.serverCallIdToClients.get(serverCallId);
    if (!clients || clients.size === 0) {
      this.logger.warn(`No clients connected for server call ID: ${serverCallId}`);
      return;
    }

    const message = {
      type: eventType,
      data: data,
      serverCallId: serverCallId,
      timestamp: new Date().toISOString(),
    };

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });

    this.logger.debug(
      `Broadcasted ${eventType} event to ${clients.size} clients for server call ${serverCallId}`,
    );
  }

  // Send audio data to all clients connected to a specific server call ID
  sendAudioToServerCall(serverCallId: string, audioData: string): boolean {
    const clients = this.serverCallIdToClients.get(serverCallId);
    if (!clients || clients.size === 0) {
      return false;
    }

    let sentCount = 0;
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const message = this.audioStreamingService.createOutboundAudioData(audioData);
        this.sendToAcsClient(client, message);
        sentCount++;
      }
    });

    this.logger.debug(`Sent audio data to ${sentCount} clients for server call ${serverCallId}`);
    return sentCount > 0;
  }

  // Stop audio for all clients connected to a specific server call ID
  stopAudioForServerCall(serverCallId: string): boolean {
    const clients = this.serverCallIdToClients.get(serverCallId);
    if (!clients || clients.size === 0) {
      return false;
    }

    let stoppedCount = 0;
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const stopMessage = this.audioStreamingService.createStopAudioMessage();
        this.sendToAcsClient(client, stopMessage);
        stoppedCount++;
      }
    });

    this.logger.debug(`Stopped audio for ${stoppedCount} clients for server call ${serverCallId}`);
    return stoppedCount > 0;
  }

  // Get all active server call IDs
  getActiveServerCallIds(): string[] {
    return Array.from(this.serverCallIdToClients.keys());
  }

  // Get statistics for server call connections
  getServerCallStats(): { [serverCallId: string]: number } {
    const stats: { [serverCallId: string]: number } = {};
    for (const [serverCallId, clients] of this.serverCallIdToClients.entries()) {
      stats[serverCallId] = clients.size;
    }
    return stats;
  }
}
