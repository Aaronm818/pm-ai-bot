import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CallAutomationService } from './call-automation.service';
import { CallAutomationController } from './call-automation.controller';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [ConfigModule, WebSocketModule],
  controllers: [CallAutomationController],
  providers: [CallAutomationService],
  exports: [CallAutomationService],
})
export class CallAutomationModule {}
