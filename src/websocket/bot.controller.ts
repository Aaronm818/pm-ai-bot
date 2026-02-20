import { Controller, Post, Req, Res, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  BotFrameworkAdapter,
  TurnContext,
  ActivityTypes,
} from 'botbuilder';
import { ClaudeService } from './claude.service';

@Controller('api')
export class BotController implements OnModuleInit {
  private readonly logger = new Logger(BotController.name);
  private adapter: BotFrameworkAdapter;

  constructor(
    private readonly configService: ConfigService,
    private readonly claudeService: ClaudeService,
  ) {}

  onModuleInit() {
    const appId = this.configService.get<string>('MICROSOFT_APP_ID', '');
    const appPassword = this.configService.get<string>('MICROSOFT_APP_PASSWORD', '');
    const tenantId = this.configService.get<string>('MICROSOFT_APP_TENANT_ID', '');

    this.adapter = new BotFrameworkAdapter({
      appId,
      appPassword,
      channelAuthTenant: tenantId,
    });

    this.adapter.onTurnError = async (context: TurnContext, error: Error) => {
      this.logger.error(`Bot turn error: ${error.message}`, error.stack);
      await context.sendActivity('Sorry, something went wrong. Please try again.');
    };

    this.logger.log('Bot Framework adapter initialized');
    this.logger.log(`  App ID: ${appId ? appId.substring(0, 8) + '...' : 'NOT SET'}`);
    this.logger.log(`  Tenant: ${tenantId ? tenantId.substring(0, 8) + '...' : 'NOT SET'}`);
  }

  @Post('messages')
  async messages(@Req() req: Request, @Res() res: Response) {
    await this.adapter.processActivity(req, res, async (context: TurnContext) => {
      if (context.activity.type === ActivityTypes.Message) {
        const userText = context.activity.text || '';
        this.logger.log(`Bot message from ${context.activity.from?.name || 'unknown'}: "${userText}"`);

        // Send typing indicator
        await context.sendActivity({ type: ActivityTypes.Typing });

        // Route through Claude for AI response
        const sessionId = `bot-${context.activity.conversation?.id || 'default'}`;
        const response = await this.claudeService.chat(sessionId, userText);

        if (response.error) {
          this.logger.error(`Claude error: ${response.error}`);
          await context.sendActivity('I encountered an error processing your request. Please try again.');
        } else {
          await context.sendActivity(response.text);
        }
      } else if (context.activity.type === ActivityTypes.ConversationUpdate) {
        // Greet new members
        if (context.activity.membersAdded) {
          for (const member of context.activity.membersAdded) {
            if (member.id !== context.activity.recipient.id) {
              await context.sendActivity(
                'Hello! I\'m PM AI Bot, your project management assistant. How can I help you today?',
              );
            }
          }
        }
      }
    });
  }
}
