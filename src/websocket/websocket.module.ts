import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { AudioStreamingService } from './audio-streaming.service';

@Module({
  imports: [ConfigModule],
  providers: [WebSocketGateway, WebSocketService, AudioStreamingService],
  exports: [WebSocketGateway, WebSocketService, AudioStreamingService],
})
export class WebSocketModule {}
