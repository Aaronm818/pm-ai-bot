import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('api')
export class WebRTCController {
  private logger = new Logger('WebRTCController');

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate ephemeral token for WebRTC connection to Azure OpenAI Realtime
   * Browser calls this, then connects directly to Azure OpenAI via WebRTC
   */
  @Post('webrtc-token')
  async getWebRTCToken(@Body() body: { instructions?: string }) {
    const endpoint = this.configService.get<string>('OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const deployment = this.configService.get<string>('OPENAI_DEPLOYMENT') || 'gpt-realtime';

    if (!endpoint || !apiKey) {
      this.logger.error('Azure OpenAI not configured');
      return { error: 'Azure OpenAI not configured' };
    }

    try {
      // Azure OpenAI ephemeral token endpoint
      const tokenUrl = `${endpoint}/openai/v1/realtime/client_secrets`;
      
      this.logger.log(`🔑 Requesting ephemeral token from: ${tokenUrl}`);

      const sessionConfig = {
        session: {
          type: 'realtime',
          model: deployment,
          instructions: body.instructions || `You are PM AI Bot, a helpful Project Manager assistant for Teams meetings.
You listen to conversations and respond when someone says "Hey PM" or "Project Manager".
Keep responses concise and helpful. Focus on action items, summaries, and meeting assistance.

CALENDAR: When asked about calendar or schedule, you'll receive calendar data - read it to the user.
TEAMS: When asked to send a message, confirm you'll send it.
DOCUMENTS: When asked to create a report or document, say "Sure, I'll create that for you. Give me just a moment."
VISION: When the user asks about their screen, what they see, or what's displayed, say ONLY "Let me take a look at your screen" and STOP. Do NOT describe, guess, or make up what might be on screen. You will receive a vision analysis with the real screen content - wait for it.

Keep responses brief and conversational. Be friendly and professional.`,
          audio: {
            output: {
              voice: 'alloy',
            },
          },
        },
      };

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionConfig),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Token request failed: ${response.status} - ${errorText}`);
        return { error: `Token request failed: ${response.status}` };
      }

      const data = await response.json();
      const ephemeralToken = data.value;

      if (!ephemeralToken) {
        this.logger.error('No ephemeral token in response');
        return { error: 'No ephemeral token received' };
      }

      this.logger.log('✅ Ephemeral token generated successfully');

      // Return token and WebRTC endpoint info
      return {
        token: ephemeralToken,
        endpoint: endpoint,
        webrtcUrl: `${endpoint}/openai/v1/realtime/calls`,
        deployment: deployment,
      };
    } catch (error) {
      this.logger.error(`Token generation error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Health check endpoint for WebRTC status
   */
  @Get('webrtc-status')
  getStatus() {
    const endpoint = this.configService.get<string>('OPENAI_ENDPOINT');
    const deployment = this.configService.get<string>('OPENAI_DEPLOYMENT') || 'gpt-realtime';
    
    return {
      configured: !!endpoint,
      endpoint: endpoint ? `${endpoint.substring(0, 30)}...` : 'NOT SET',
      deployment: deployment,
      webrtcSupported: true,
    };
  }
}
