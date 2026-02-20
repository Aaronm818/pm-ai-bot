import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);
  
  // Power Automate Flow URL for Teams Messaging
  private readonly teamsFlowUrl = process.env.POWER_AUTOMATE_TEAMS_URL || 
    'https://default599e51d62f8c43478e591f795a51a9.8c.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ed0c4dfb79ea4158ac54e23287f8837a/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gL_iI0Gbq3CoDdPj8qPSEaF9YGmEF8lmYt8Q-tq12Jc';

  /**
   * Send a message to the Teams group chat via Power Automate
   */
  async sendMessage(message: string): Promise<boolean> {
    try {
      this.logger.log(`💬 Sending Teams message: "${message.substring(0, 50)}..."`);
      
      const response = await fetch(this.teamsFlowUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Power Automate returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      this.logger.log('✅ Teams message sent successfully');
      
      return result.success || true;
    } catch (error) {
      this.logger.error('❌ Failed to send Teams message:', error.message);
      return false;
    }
  }

  /**
   * Send a meeting starting notification
   */
  async sendMeetingStarting(meetingName?: string): Promise<boolean> {
    const message = meetingName 
      ? `🎯 Meeting starting: ${meetingName}`
      : '🎯 The meeting is starting now!';
    return this.sendMessage(message);
  }

  /**
   * Send action items to the team
   */
  async sendActionItems(actionItems: string[]): Promise<boolean> {
    if (!actionItems || actionItems.length === 0) {
      return false;
    }

    const itemsList = actionItems.map((item, i) => `${i + 1}. ${item}`).join('\n');
    const message = `📋 Action Items from the meeting:\n\n${itemsList}`;
    
    return this.sendMessage(message);
  }

  /**
   * Send meeting summary to the team
   */
  async sendMeetingSummary(summary: string): Promise<boolean> {
    const message = `📝 Meeting Summary:\n\n${summary}`;
    return this.sendMessage(message);
  }

  /**
   * Send a custom notification
   */
  async sendNotification(title: string, body: string): Promise<boolean> {
    const message = `${title}\n\n${body}`;
    return this.sendMessage(message);
  }

  /**
   * Check if Teams integration is configured
   */
  isConfigured(): boolean {
    return !!this.teamsFlowUrl;
  }
}
