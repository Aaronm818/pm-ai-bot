import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);
  
  // Power Automate Flow URL for Calendar API
  private readonly calendarFlowUrl = process.env.POWER_AUTOMATE_CALENDAR_URL || 
    'https://default599e51d62f8c43478e591f795a51a9.8c.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/cb0657fc187c4f9480ca475d983888d6/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=IrY9VpDTGQKfEKBG5jfRZmpswcB3sfUHPplCTkvnrjc';

  /**
   * Get calendar events for the next 7 days via Power Automate
   */
  async getCalendarEvents(): Promise<any[]> {
    try {
      this.logger.log('📅 Fetching calendar events via Power Automate...');
      
      const response = await fetch(this.calendarFlowUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'getCalendar' }),
      });

      if (!response.ok) {
        throw new Error(`Power Automate returned ${response.status}: ${response.statusText}`);
      }

      const events = await response.json();
      this.logger.log(`✅ Retrieved ${Array.isArray(events) ? events.length : 0} calendar events`);
      
      return Array.isArray(events) ? events : [];
    } catch (error) {
      this.logger.error('❌ Failed to fetch calendar events:', error.message);
      return [];
    }
  }

  /**
   * Get today's meetings
   */
  async getTodaysMeetings(): Promise<any[]> {
    const events = await this.getCalendarEvents();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return events.filter(event => {
      const eventStart = new Date(event.start?.dateTime || event.start);
      return eventStart >= today && eventStart < tomorrow;
    });
  }

  /**
   * Format calendar events for voice response
   */
  formatEventsForVoice(events: any[]): string {
    if (!events || events.length === 0) {
      return "You don't have any meetings scheduled.";
    }

    if (events.length === 1) {
      const event = events[0];
      const time = this.formatTime(event.start?.dateTime || event.start);
      return `You have one meeting: ${event.subject} at ${time}.`;
    }

    const meetingList = events.slice(0, 5).map(event => {
      const time = this.formatTime(event.start?.dateTime || event.start);
      return `${event.subject} at ${time}`;
    }).join(', ');

    const moreText = events.length > 5 ? `, and ${events.length - 5} more` : '';
    
    return `You have ${events.length} meetings: ${meetingList}${moreText}.`;
  }

  /**
   * Format time for voice (e.g., "2:30 PM")
   */
  private formatTime(dateTimeString: string): string {
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return 'unknown time';
    }
  }

  /**
   * Get a summary of upcoming meetings
   */
  async getMeetingSummary(): Promise<string> {
    const todaysMeetings = await this.getTodaysMeetings();
    return this.formatEventsForVoice(todaysMeetings);
  }

  /**
   * Check if Graph/Calendar integration is configured
   */
  isConfigured(): boolean {
    return !!this.calendarFlowUrl;
  }
}
