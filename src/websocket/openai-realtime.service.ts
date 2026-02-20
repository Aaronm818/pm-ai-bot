import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';

interface OpenAISession {
  ws: WebSocket | null;
  serverCallId: string;
  transcript: Array<{ role: string; text: string; timestamp: Date }>;
  isConnected: boolean;
  lastActivity: Date;
  isSpeaking: boolean;
  commitTimer?: ReturnType<typeof setInterval>;
}

/**
 * =============================================================================
 * PM AI BOT - VOICE CONFIGURATION
 * =============================================================================
 * 
 * These settings follow OpenAI's Realtime API best practices.
 * See: PM-AI-Bot-Voice-Configuration-Playbook.md for full documentation.
 * 
 * Last Updated: February 18, 2026
 * =============================================================================
 */

// Voice Configuration Constants
const VOICE_CONFIG = {
  // Voice Selection - 'marin' is OpenAI's recommended highest quality voice
  VOICE: 'marin',
  
  // Audio Format - pcm16 at 24kHz is standard for Realtime API
  AUDIO_FORMAT: 'pcm16',
  SAMPLE_RATE: 24000,
  
  // Speech Speed - 1.0 is normal, range is 0.25-1.5
  SPEED: 1.0,
  
  // Noise Reduction - 'far_field' for conference rooms/laptop mics
  // Options: 'near_field' (headphones), 'far_field' (meeting rooms)
  NOISE_REDUCTION: 'far_field',
  
  // Turn Detection Settings
  TURN_DETECTION: {
    // 'server_vad' = volume-based, 'semantic_vad' = AI-based turn detection
    TYPE: 'server_vad',
    
    // Threshold 0.0-1.0 - Higher = less sensitive to background noise
    // With noise_reduction enabled, we can use a lower threshold (0.6 vs 0.8)
    THRESHOLD: 0.6,
    
    // Audio captured before speech is detected (ms)
    // 500ms ensures we capture the full "Hey PM" wake word
    PREFIX_PADDING_MS: 500,
    
    // How long to wait after silence before processing (ms)
    // 1200ms allows natural pauses without cutting users off
    SILENCE_DURATION_MS: 1200,
    
    // Manual response control - we trigger after wake word detection
    CREATE_RESPONSE: false,
    
    // Allow users to interrupt PM while speaking
    INTERRUPT_RESPONSE: true,
  },
  
  // Response Limits
  MAX_RESPONSE_TOKENS: 2048,  // Keep voice responses concise
  
  // Transcription hints for better accuracy
  TRANSCRIPTION_PROMPT: 'PM, Hey PM, Project Manager, Teams, SharePoint, calendar, Concentrix, Microsoft, meeting',
};

@Injectable()
export class OpenAIRealtimeService implements OnModuleInit {
  private logger: Logger = new Logger('OpenAIRealtimeService');
  private sessions: Map<string, OpenAISession> = new Map();

  // Power Automate Flow URLs for Calendar, Teams, and SharePoint
  private calendarFlowUrl = 'https://default599e51d62f8c43478e591f795a51a9.8c.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/cb0657fc187c4f9480ca475d983888d6/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=IrY9VpDTGQKfEKBG5jfRZmpswcB3sfUHPplCTkvnrjc';
  private teamsFlowUrl = 'https://default599e51d62f8c43478e591f795a51a9.8c.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ed0c4dfb79ea4158ac54e23287f8837a/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gL_iI0Gbq3CoDdPj8qPSEaF9YGmEF8lmYt8Q-tq12Jc';
  private sharePointFlowUrl = 'https://default599e51d62f8c43478e591f795a51a9.8c.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/fd85bcf5735c417d9ad6941e57dcd167/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BBYtHondLl4KXWGJswH20bInWt-y4sxn1Xc9yMRAYw4';

  // Callbacks for sending responses back to clients
  private audioResponseCallback: ((serverCallId: string, audioBase64: string) => void) | null = null;
  private transcriptCallback: ((serverCallId: string, text: string, isFinal: boolean) => void) | null = null;
  private getVisionContextCallback: ((serverCallId: string) => string | null) | null = null;
  private speakingStateChangedCallback: ((serverCallId: string, isSpeaking: boolean) => void) | null = null;
  private pmTextResponseCallback: ((serverCallId: string, text: string) => Promise<void>) | null = null;
  private silentDocumentCallback: ((serverCallId: string, transcript: string) => Promise<void>) | null = null;
  
  // Thinking status callback - sends activity updates to client
  private thinkingCallback: ((serverCallId: string, message: string) => void) | null = null;

  // Vision analysis callback - calls Claude to analyze screenshots
  private visionAnalysisCallback: ((screenshotBase64: string, userQuestion: string) => Promise<string>) | null = null;

  // Wake word patterns for OpenAI Realtime (PM Bot)
  private pmWakeWordPatterns = [
    /hey\s*p\.?m\.?/i,
    /hey\s*project\s*manager/i,
    /project\s*manager/i,
    /p\.?m\.?\s*bot/i,
  ];

  // Wake word patterns for Claude
  private claudeWakeWordPatterns = [
    /hey\s*claude/i,
    /claude/i,
    /ask\s*claude/i,
  ];

  private claudeRequestCallback: ((serverCallId: string, transcript: string, visionContext: string | null) => Promise<void>) | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.logger.log('OpenAI Realtime Service initialized');
    this.logger.log(`🎤 Voice Config: ${VOICE_CONFIG.VOICE}, Noise Reduction: ${VOICE_CONFIG.NOISE_REDUCTION}`);
    this.logger.log(`🎛️ VAD: ${VOICE_CONFIG.TURN_DETECTION.TYPE}, Threshold: ${VOICE_CONFIG.TURN_DETECTION.THRESHOLD}`);
  }

  setAudioResponseCallback(callback: ((serverCallId: string, audioBase64: string) => void) | null): void {
    this.audioResponseCallback = callback;
    if (callback === null) {
      this.logger.log('🔇 Audio callback disabled - using TTS for voice output');
    }
  }

  setTranscriptCallback(callback: (serverCallId: string, text: string, isFinal: boolean) => void): void {
    this.transcriptCallback = callback;
  }

  setVisionContextCallback(callback: (serverCallId: string) => string | null): void {
    this.getVisionContextCallback = callback;
  }

  setSpeakingStateChangedCallback(callback: (serverCallId: string, isSpeaking: boolean) => void): void {
    this.speakingStateChangedCallback = callback;
  }

  setPmTextResponseCallback(callback: (serverCallId: string, text: string) => Promise<void>): void {
    this.pmTextResponseCallback = callback;
  }

  setClaudeRequestCallback(callback: (serverCallId: string, transcript: string, visionContext: string | null) => Promise<void>): void {
    this.claudeRequestCallback = callback;
  }

  setSilentDocumentCallback(callback: (serverCallId: string, transcript: string) => Promise<void>): void {
    this.silentDocumentCallback = callback;
    this.logger.log('📄 Silent document callback registered');
  }

  setThinkingCallback(callback: (serverCallId: string, message: string) => void): void {
    this.thinkingCallback = callback;
    this.logger.log('💭 Thinking callback registered');
  }

  setVisionAnalysisCallback(callback: (screenshotBase64: string, userQuestion: string) => Promise<string>): void {
    this.visionAnalysisCallback = callback;
    this.logger.log('👁️ Vision analysis callback registered');
  }

  isSpeaking(serverCallId: string): boolean {
    return this.sessions.get(serverCallId)?.isSpeaking || false;
  }

  async createSession(serverCallId: string): Promise<boolean> {
    if (this.sessions.has(serverCallId)) {
      this.logger.log(`Session already exists for ${serverCallId}`);
      return true;
    }

    const endpoint = this.configService.get<string>('OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const deployment = this.configService.get<string>('OPENAI_DEPLOYMENT') || 'gpt-realtime';

    this.logger.log(`[DEBUG] OPENAI_ENDPOINT = "${endpoint || 'NOT SET'}"`);
    this.logger.log(`[DEBUG] OPENAI_API_KEY = "${apiKey ? '***' + apiKey.slice(-4) : 'NOT SET'}"`);
    this.logger.log(`[DEBUG] OPENAI_DEPLOYMENT = "${deployment}"`);

    if (!endpoint || !apiKey) {
      this.logger.error('OpenAI endpoint or API key not configured');
      return false;
    }

    try {
      const wsUrl = `${endpoint.replace('https://', 'wss://')}/openai/realtime?api-version=2024-10-01-preview&deployment=${deployment}`;
      this.logger.log(`Connecting to OpenAI Realtime: ${wsUrl}`);

      const ws = new WebSocket(wsUrl, {
        headers: { 'api-key': apiKey },
      });

      const session: OpenAISession = {
        ws,
        serverCallId,
        transcript: [],
        isConnected: false,
        lastActivity: new Date(),
        isSpeaking: false,
      };

      this.sessions.set(serverCallId, session);

      ws.on('open', () => {
        this.logger.log(`OpenAI Realtime connected for ${serverCallId}`);
        session.isConnected = true;
        this.configureSession(serverCallId);
      });

      ws.on('message', (data: Buffer) => {
        this.handleOpenAIMessage(serverCallId, data);
      });

      ws.on('error', (error) => {
        this.logger.error(`OpenAI Realtime error for ${serverCallId}: ${error.message}`);
      });

      ws.on('close', () => {
        this.logger.log(`OpenAI Realtime disconnected for ${serverCallId}`);
        session.isConnected = false;
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to create OpenAI session: ${error.message}`);
      return false;
    }
  }

  /**
   * Configure the OpenAI Realtime session with optimized voice parameters.
   * 
   * PARAMETER REFERENCE:
   * ====================
   * 
   * modalities: ['text']
   *   - We use text-only for INPUT to enable manual wake word control
   *   - Audio output is enabled on response.create
   * 
   * voice: 'marin'
   *   - OpenAI's recommended highest quality voice
   *   - Professional tone suitable for enterprise meetings
   *   - Alternative: 'cedar' for more conversational tone
   * 
   * noise_reduction: { type: 'far_field' }
   *   - Filters background noise BEFORE VAD processing
   *   - 'far_field' = conference rooms, laptop mics (Teams meetings)
   *   - 'near_field' = headphones, close microphones
   *   - Improves transcription accuracy and reduces false VAD triggers
   * 
   * turn_detection.type: 'server_vad'
   *   - Volume-based voice activity detection
   *   - Fast and reliable for wake word scenarios
   *   - Alternative: 'semantic_vad' for more natural conversations
   * 
   * turn_detection.threshold: 0.6
   *   - Lowered from 0.8 because noise_reduction handles background noise
   *   - Range: 0.0 (very sensitive) to 1.0 (requires loud speech)
   *   - 0.6 catches quieter speakers while still filtering noise
   * 
   * turn_detection.prefix_padding_ms: 500
   *   - Audio captured BEFORE speech is detected
   *   - 500ms ensures we capture the full "Hey PM" wake word
   *   - Lower values may clip the beginning of utterances
   * 
   * turn_detection.silence_duration_ms: 1200
   *   - How long to wait after silence before processing
   *   - 1200ms allows natural pauses without cutting users off
   *   - Lower = faster response, Higher = more patient
   * 
   * turn_detection.create_response: false
   *   - We manually trigger responses after wake word detection
   *   - Gives us control over routing (PM vs Claude vs document generation)
   * 
   * turn_detection.interrupt_response: true
   *   - Allows users to interrupt PM while it's speaking
   *   - Better UX - users don't have to wait for PM to finish
   * 
   * input_audio_transcription.prompt: [domain terms]
   *   - Helps Whisper recognize domain-specific words
   *   - Include common terms: PM, Teams, SharePoint, etc.
   * 
   * max_response_output_tokens: 2048
   *   - Caps response length for voice (keeps it concise)
   *   - Voice responses should be short - under 30 seconds
   */
  private configureSession(serverCallId: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const sessionConfig = {
      type: 'session.update',
      session: {
        // Accept audio input for transcription; responses are text-only (create_response: false)
        modalities: ['text', 'audio'],
        
        // System prompt optimized for voice responses
        instructions: `You are PM AI Bot, a voice-activated Project Manager assistant for Microsoft Teams meetings.

WAKE WORD: Respond when someone says "Hey PM" or "Project Manager".

VOICE STYLE:
- Keep responses under 30 seconds of spoken audio
- Be concise and conversational - this is voice, not text
- Avoid bullet points, numbered lists, and markdown formatting
- Use natural speech patterns and contractions
- Confirm actions before executing them

CAPABILITIES:
- Check calendar via Microsoft Graph API (Power Automate)
- Send messages to Teams channels
- Analyze screen content via Claude Vision
- Generate documents and save to SharePoint

CONTEXT HANDLING:
- CALENDAR: When you receive calendar data in CONTEXT DATA, summarize it naturally
- TEAMS: Confirm when messages are sent successfully
- VISION: When describing screen content, be specific but brief
- DOCUMENTS: Say "Sure, I'll create that for you" and keep the verbal response short

IMPORTANT: The document will automatically appear in the Workspace tab and be saved to SharePoint - don't explain this every time, just acknowledge the request briefly.`,

        // Audio input configuration with noise reduction
        input_audio_format: VOICE_CONFIG.AUDIO_FORMAT,
        
        // Transcription settings with domain hints
        input_audio_transcription: {
          model: 'whisper-1',
          prompt: VOICE_CONFIG.TRANSCRIPTION_PROMPT,
        },
        
        // Voice Activity Detection (VAD) settings
        turn_detection: {
          type: VOICE_CONFIG.TURN_DETECTION.TYPE,
          threshold: VOICE_CONFIG.TURN_DETECTION.THRESHOLD,
          prefix_padding_ms: VOICE_CONFIG.TURN_DETECTION.PREFIX_PADDING_MS,
          silence_duration_ms: VOICE_CONFIG.TURN_DETECTION.SILENCE_DURATION_MS,
          create_response: VOICE_CONFIG.TURN_DETECTION.CREATE_RESPONSE,
        },
      },
    };

    session.ws.send(JSON.stringify(sessionConfig));

    this.logger.log(`✅ Session configured for ${serverCallId}`);
    this.logger.log(`   Voice: ${VOICE_CONFIG.VOICE} | Noise Reduction: ${VOICE_CONFIG.NOISE_REDUCTION}`);
    this.logger.log(`   VAD: ${VOICE_CONFIG.TURN_DETECTION.TYPE} @ ${VOICE_CONFIG.TURN_DETECTION.THRESHOLD} threshold`);
    this.logger.log(`   Silence: ${VOICE_CONFIG.TURN_DETECTION.SILENCE_DURATION_MS}ms | Prefix: ${VOICE_CONFIG.TURN_DETECTION.PREFIX_PADDING_MS}ms`);

    // Periodically commit audio buffer to force transcription of continuous audio
    // (e.g., YouTube/meeting audio that never has long silence gaps)
    session.commitTimer = setInterval(() => {
      if (session.ws && session.ws.readyState === WebSocket.OPEN && !session.isSpeaking) {
        session.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        this.logger.debug(`🔄 Auto-committed audio buffer for ${serverCallId}`);
      }
    }, 8000);
  }

  sendAudio(serverCallId: string, audioBase64: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (session.isSpeaking) {
      return;
    }

    const audioMessage = {
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    };
    session.ws.send(JSON.stringify(audioMessage));
  }

  closeSession(serverCallId: string): void {
    const session = this.sessions.get(serverCallId);
    if (session) {
      if (session.commitTimer) {
        clearInterval(session.commitTimer);
      }
      if (session.ws) {
        session.ws.close();
      }
    }
    this.sessions.delete(serverCallId);
    this.logger.log(`Session closed: ${serverCallId}`);
  }

  endSession(serverCallId: string): void {
    this.closeSession(serverCallId);
  }

  private handleOpenAIMessage(serverCallId: string, data: Buffer): void {
    const session = this.sessions.get(serverCallId);
    if (!session) return;

    try {
      const message = JSON.parse(data.toString());
      session.lastActivity = new Date();

      switch (message.type) {
        case 'session.created':
          this.logger.log(`Session created: ${serverCallId}`);
          break;

        case 'session.updated':
          this.logger.log(`Session updated: ${serverCallId}`);
          break;

        case 'input_audio_buffer.speech_started':
          this.logger.log(`Speech started: ${serverCallId}`);
          break;

        case 'input_audio_buffer.speech_stopped':
          this.logger.log(`Speech stopped: ${serverCallId}`);
          break;

        case 'input_audio_buffer.committed':
          this.logger.log(`Audio committed: ${serverCallId}`);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (message.transcript) {
            this.handleTranscript(serverCallId, message.transcript);
          }
          break;

        case 'response.audio.delta':
          if (message.delta && this.audioResponseCallback) {
            this.audioResponseCallback(serverCallId, message.delta);
          }
          break;

        case 'response.audio_transcript.delta':
          if (message.delta && this.transcriptCallback) {
            this.transcriptCallback(serverCallId, message.delta, false);
          }
          break;

        case 'response.audio_transcript.done':
          this.logger.log(`🔊 PM S2S transcript: "${message.transcript?.substring(0, 50)}..."`);
          if (message.transcript && this.transcriptCallback) {
            this.transcriptCallback(serverCallId, message.transcript, true);
          }
          break;

        case 'response.text.delta':
          if (message.delta && this.transcriptCallback) {
            this.transcriptCallback(serverCallId, message.delta, false);
          }
          break;

        case 'response.text.done':
          this.logger.log(`🔊 PM text response complete: ${serverCallId}`);
          if (message.text && this.pmTextResponseCallback) {
            this.pmTextResponseCallback(serverCallId, message.text);
          }
          break;

        case 'response.audio.done':
          this.logger.log(`Audio segment done: ${serverCallId}`);
          break;

        case 'response.done':
          this.logger.log(`🔇 AI finished speaking: ${serverCallId}`);
          setTimeout(() => {
            const sess = this.sessions.get(serverCallId);
            if (sess) {
              sess.isSpeaking = false;
              this.logger.log(`🎤 Resuming audio input for: ${serverCallId}`);
              if (this.speakingStateChangedCallback) {
                this.speakingStateChangedCallback(serverCallId, false);
              }
            }
          }, 500);
          break;

        case 'error':
          this.logger.error(`OpenAI error: ${JSON.stringify(message.error)}`);
          session.isSpeaking = false;
          break;

        default:
          if (message.type && !message.type.startsWith('response.content_part')) {
            this.logger.debug(`OpenAI message: ${message.type}`);
          }
      }
    } catch (error) {
      this.logger.error(`Error parsing OpenAI message: ${error.message}`);
    }
  }

  private async handleTranscript(serverCallId: string, transcript: string): Promise<void> {
    const session = this.sessions.get(serverCallId);
    if (!session || !transcript) return;

    this.logger.log(`Transcript [${serverCallId}]: ${transcript}`);

    session.transcript.push({
      role: 'user',
      text: transcript,
      timestamp: new Date(),
    });

    if (this.transcriptCallback) {
      this.transcriptCallback(serverCallId, transcript, true);
    }

    const hasPmWakeWord = this.pmWakeWordPatterns.some((pattern) =>
      pattern.test(transcript),
    );

    const hasClaudeWakeWord = this.claudeWakeWordPatterns.some((pattern) =>
      pattern.test(transcript),
    );

    // Claude takes priority if both are detected
    if (hasClaudeWakeWord && this.claudeRequestCallback) {
      this.logger.log(`🧠 CLAUDE WAKE WORD DETECTED in: "${transcript}"`);
      const visionContext = this.getVisionContextCallback ? this.getVisionContextCallback(serverCallId) : null;
      await this.claudeRequestCallback(serverCallId, transcript, visionContext);
      return;
    }

    if (hasPmWakeWord) {
      this.logger.log(`🎯 PM WAKE WORD DETECTED in: "${transcript}"`);

      // Check for CALENDAR questions
      const isCalendarQuestion = /calendar|schedule|meeting|meetings|what.*(on my calendar|on my schedule|do i have)|am i free|busy|appointment/i.test(transcript);
      
      // Check for TEAMS message requests
      const isTeamsMessage = /send.*(message|team|chat)|tell.*(team|everyone|group)|message.*(team|channel|chat)|notify/i.test(transcript);

      // Check if this is a DOCUMENT REQUEST
      const isDocumentRequest = /write\s+(me\s+)?(a\s+)?(status\s+)?report|create\s+(me\s+)?(a\s+)?(status\s+)?report|generate\s+(me\s+)?(a\s+)?report|make\s+(me\s+)?(a\s+)?report|draft\s+(me\s+)?(an?\s+)?email|write\s+(me\s+)?(an?\s+)?email|create\s+(me\s+)?(a\s+)?summary|write\s+(me\s+)?(a\s+)?summary|summarize|summary\s+of|prepare\s+(me\s+)?(a\s+)?(report|summary|email)|give\s+me\s+(a\s+)?(report|summary)|can\s+you\s+(create|write|make|generate)\s+(me\s+)?(a\s+)?(report|summary|email)/i.test(transcript);

      // Handle CALENDAR questions - fetch real data first
      if (isCalendarQuestion) {
        this.logger.log('📅 CALENDAR QUESTION DETECTED - Fetching real calendar data...');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🔍 Detected calendar question...');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '📅 Fetching calendar from Power Automate → Microsoft Graph API...');
        const calendarData = await this.fetchCalendarData();
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '✅ Calendar data received');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🤖 Sending to OpenAI Realtime for response...');
        this.triggerResponseWithContext(serverCallId, calendarData);
        return;
      }

      // Handle TEAMS message requests
      if (isTeamsMessage) {
        this.logger.log('💬 TEAMS MESSAGE REQUEST DETECTED');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🔍 Detected Teams message request...');
        const messageMatch = transcript.match(/(?:send|tell|message|say|notify).*?(?:that|saying|:)?\s*["']?(.+?)["']?$/i);
        const messageToSend = messageMatch ? messageMatch[1] : 'Hello from PM AI Bot!';
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '💬 Sending to Power Automate → Microsoft Teams API...');
        const result = await this.sendTeamsMessage(messageToSend);
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '✅ Message sent to Teams');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🤖 Sending to OpenAI Realtime for confirmation...');
        this.triggerResponseWithContext(serverCallId, result);
        return;
      }

      // Handle document requests - BEFORE vision check
      if (isDocumentRequest) {
        this.logger.log('📄 DOCUMENT REQUEST MATCHED');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🔍 Detected document request...');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🤖 OpenAI Realtime generating voice response...');
        this.triggerResponse(serverCallId);
        if (this.silentDocumentCallback) {
          if (this.thinkingCallback) this.thinkingCallback(serverCallId, '📄 Sending to Claude for document generation...');
          try {
            await this.silentDocumentCallback(serverCallId, transcript);
          } catch (error) {
            this.logger.error(`Silent document generation failed: ${error.message}`);
          }
        }
        return;
      }

      // Check for vision questions - uses Claude to actually analyze screenshot
      if (this.getVisionContextCallback && this.visionAnalysisCallback) {
        const screenshot = this.getVisionContextCallback(serverCallId);
        if (screenshot) {
          this.logger.log('👁️ Vision question detected - analyzing with Claude...');
          if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🔍 Detected screen question...');
          if (this.thinkingCallback) this.thinkingCallback(serverCallId, '📷 Capturing screenshot...');
          if (this.thinkingCallback) this.thinkingCallback(serverCallId, '👁️ Sending to Claude Vision API for analysis...');
          await this.triggerResponseWithVision(serverCallId, transcript, screenshot);
          return;
        }
      }

      // Default response
      this.triggerResponse(serverCallId);
    }
  }

  /**
   * Trigger a response from OpenAI Realtime.
   * 
   * Response configuration includes:
   * - modalities: ['text', 'audio'] - We want voice output
   * - voice: from VOICE_CONFIG - Currently 'marin'
   * - max_response_output_tokens: Keeps responses concise for voice
   */
  triggerResponse(serverCallId: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(`Cannot trigger response - no active session for ${serverCallId}`);
      return;
    }

    this.logger.log(`🚀 TRIGGERING AI RESPONSE for ${serverCallId}`);
    session.isSpeaking = true;

    if (this.speakingStateChangedCallback) {
      this.speakingStateChangedCallback(serverCallId, true);
    }

    const responseCreate = {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        voice: VOICE_CONFIG.VOICE,
      },
    };
    session.ws.send(JSON.stringify(responseCreate));
  }

  /**
   * Trigger response with REAL vision analysis from Claude
   */
  private async triggerResponseWithVision(
    serverCallId: string,
    userQuestion: string,
    screenshotBase64: string
  ): Promise<void> {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.logger.log(`👁️ Processing vision request for ${serverCallId}`);
      session.isSpeaking = true;

      if (this.speakingStateChangedCallback) {
        this.speakingStateChangedCallback(serverCallId, true);
      }

      // ACTUALLY analyze the screenshot with Claude Vision
      let screenAnalysis = 'Unable to analyze screen.';
      if (this.visionAnalysisCallback) {
        this.logger.log('👁️ Calling Claude Vision API to analyze screenshot...');
        screenAnalysis = await this.visionAnalysisCallback(screenshotBase64, userQuestion);
        this.logger.log(`👁️ Claude Vision analysis: "${screenAnalysis.substring(0, 100)}..."`);
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '✅ Claude analyzed screen');
        if (this.thinkingCallback) this.thinkingCallback(serverCallId, '🤖 Sending analysis to OpenAI Realtime for voice response...');
      }

      // Send the REAL analysis to OpenAI Realtime as context
      const contextItem = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `[SCREEN ANALYSIS - This is what Claude sees on the user's screen]\n${screenAnalysis}\n\n[USER'S QUESTION]\n${userQuestion}`
            }
          ]
        }
      };
      session.ws.send(JSON.stringify(contextItem));

      const responseCreate = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          voice: VOICE_CONFIG.VOICE,
          },
      };
      session.ws.send(JSON.stringify(responseCreate));
    } catch (error) {
      this.logger.error(`Vision analysis failed: ${error.message}`);
      this.triggerResponse(serverCallId);
    }
  }

  /**
   * Trigger response with injected context (calendar/teams data)
   */
  private triggerResponseWithContext(serverCallId: string, contextMessage: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.logger.log(`🚀 TRIGGERING RESPONSE WITH CONTEXT for ${serverCallId}`);
    session.isSpeaking = true;

    if (this.speakingStateChangedCallback) {
      this.speakingStateChangedCallback(serverCallId, true);
    }

    // Inject context as a user message
    const contextItem = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: `[CONTEXT DATA - Use this to answer the user's question]\n${contextMessage}` }]
      }
    };
    session.ws.send(JSON.stringify(contextItem));

    // Trigger response with voice config
    const responseCreate = {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        voice: VOICE_CONFIG.VOICE,
      },
    };
    session.ws.send(JSON.stringify(responseCreate));
  }

  /**
   * Fetch calendar events from Power Automate
   */
  private async fetchCalendarData(): Promise<string> {
    try {
      this.logger.log('📅 Fetching calendar from Power Automate...');
      const response = await fetch(this.calendarFlowUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getCalendar' }),
      });
      
      if (!response.ok) {
        return 'Could not fetch calendar data.';
      }
      
      const events = await response.json();
      
      if (!events || events.length === 0) {
        return 'You have no meetings scheduled for the next 7 days.';
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Filter today's meetings
      const todaysMeetings = events.filter((e: any) => {
        const eventDate = new Date(e.start?.dateTime || e.start);
        return eventDate >= today && eventDate < tomorrow;
      });

      const formatted = events.slice(0, 10).map((e: any) => {
        const start = new Date(e.start?.dateTime || e.start);
        const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const date = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return `- ${e.subject} at ${time} on ${date}`;
      }).join('\n');
      
      this.logger.log(`✅ Found ${events.length} calendar events (${todaysMeetings.length} today)`);
      return `Here are your upcoming meetings (${todaysMeetings.length} today, ${events.length} total this week):\n${formatted}`;
    } catch (error) {
      this.logger.error('Calendar fetch error:', error);
      return 'Sorry, I could not access your calendar right now.';
    }
  }

  /**
   * Send Teams message via Power Automate
   */
  private async sendTeamsMessage(message: string): Promise<string> {
    try {
      this.logger.log(`💬 Sending Teams message: "${message.substring(0, 50)}..."`);
      const response = await fetch(this.teamsFlowUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      
      if (!response.ok) {
        return 'Failed to send the message to Teams.';
      }
      
      this.logger.log('✅ Teams message sent successfully');
      return 'Done! I sent the message to the team chat.';
    } catch (error) {
      this.logger.error('Teams message error:', error);
      return 'Sorry, I could not send the message right now.';
    }
  }

  /**
   * Save document to SharePoint via Power Automate
   */
  async saveDocumentToSharePoint(filename: string, content: string): Promise<boolean> {
    try {
      this.logger.log(`📁 Saving document to SharePoint: ${filename}`);
      const response = await fetch(this.sharePointFlowUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });
      
      if (!response.ok) {
        this.logger.error(`SharePoint save failed: ${response.status}`);
        return false;
      }
      
      this.logger.log(`✅ Document saved to SharePoint: ${filename}`);
      return true;
    } catch (error) {
      this.logger.error('SharePoint save error:', error);
      return false;
    }
  }

  getTranscript(serverCallId: string): Array<{ role: string; text: string; timestamp: Date }> {
    return this.sessions.get(serverCallId)?.transcript || [];
  }
}
