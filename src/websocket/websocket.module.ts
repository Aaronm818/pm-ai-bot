import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { AudioStreamingService } from './audio-streaming.service';
import { ClaudeService } from './claude.service';
import { TTSService } from './tts.service';
import { FileOutputService } from './file-output.service';
import { DataverseService } from './dataverse.service';
import { OpenAIRealtimeService } from './openai-realtime.service';
import { UserService } from './user.service';
import { AuthController } from './auth.controller';
import { BotController } from './bot.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController, BotController],
  providers: [
    WebSocketGateway,
    WebSocketService,
    AudioStreamingService,
    OpenAIRealtimeService,  // OpenAI Realtime API (gpt-realtime full model)
    ClaudeService,
    TTSService,
    FileOutputService,
    DataverseService,
    UserService,
  ],
  exports: [
    WebSocketGateway,
    WebSocketService,
    AudioStreamingService,
    OpenAIRealtimeService,
    ClaudeService,
    TTSService,
    FileOutputService,
    DataverseService,
    UserService,
  ],
})
export class WebSocketModule {}
