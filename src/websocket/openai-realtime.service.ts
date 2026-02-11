import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';

interface OpenAISession {
  ws: WebSocket | null;
  serverCallId: string;
  transcript: Array<{ role: string; text: string; timestamp: Date }>;
  isConnected: boolean;
  lastActivity: Date;
  isSpeaking: boolean; // Track if AI is currently speaking
}

@Injectable()
export class OpenAIRealtimeService implements OnModuleInit {
  private logger: Logger = new Logger('OpenAIRealtimeService');
  private sessions: Map<string, OpenAISession> = new Map();

  // Callbacks for sending responses back to clients
  private audioResponseCallback: ((serverCallId: string, audioBase64: string) => void) | null = null;
  private transcriptCallback: ((serverCallId: string, text: string, isFinal: boolean) => void) | null = null;
  private getVisionContextCallback: ((serverCallId: string) => string | null) | null = null;
  private speakingStateChangedCallback: ((serverCallId: string, isSpeaking: boolean) => void) | null = null;
  private pmTextResponseCallback: ((serverCallId: string, text: string) => Promise<void>) | null = null;
  
  // Silent document generation callback - Claude builds, no voice output
  private silentDocumentCallback: ((serverCallId: string, transcript: string) => Promise<void>) | null = null;

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
  
  // Callback for Claude requests
  private claudeRequestCallback: ((serverCallId: string, transcript: string, visionContext: string | null) => Promise<void>) | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.logger.log('OpenAI Realtime Service initialized');
  }

  /**
   * Set callback for audio responses (set to null to disable)
   */
  setAudioResponseCallback(callback: ((serverCallId: string, audioBase64: string) => void) | null): void {
    this.audioResponseCallback = callback;
    if (callback === null) {
      this.logger.log('🔇 Audio callback disabled - using TTS for voice output');
    }
  }

  /**
   * Set callback for transcripts
   */
  setTranscriptCallback(callback: (serverCallId: string, text: string, isFinal: boolean) => void): void {
    this.transcriptCallback = callback;
  }

  /**
   * Set callback for getting vision context
   */
  setVisionContextCallback(callback: (serverCallId: string) => string | null): void {
    this.getVisionContextCallback = callback;
  }

  /**
   * Set callback for speaking state changes
   */
  setSpeakingStateChangedCallback(callback: (serverCallId: string, isSpeaking: boolean) => void): void {
    this.speakingStateChangedCallback = callback;
  }

  /**
   * Set callback for PM text responses (will be converted to speech by TTS service)
   */
  setPmTextResponseCallback(callback: (serverCallId: string, text: string) => Promise<void>): void {
    this.pmTextResponseCallback = callback;
  }

  /**
   * Set callback for Claude requests (when "Hey Claude" is detected)
   */
  setClaudeRequestCallback(callback: (serverCallId: string, transcript: string, visionContext: string | null) => Promise<void>): void {
    this.claudeRequestCallback = callback;
  }

  /**
   * Set callback for silent document generation (Claude builds, PM speaks)
   */
  setSilentDocumentCallback(callback: (serverCallId: string, transcript: string) => Promise<void>): void {
    this.silentDocumentCallback = callback;
    this.logger.log('📄 Silent document callback registered');
  }

  /**
   * Check if session is currently speaking (for muting input)
   */
  isSpeaking(serverCallId: string): boolean {
    return this.sessions.get(serverCallId)?.isSpeaking || false;
  }

  /**
   * Create a new OpenAI Realtime session
   */
  async createSession(serverCallId: string): Promise<boolean> {
    if (this.sessions.has(serverCallId)) {
      this.logger.log(`Session already exists for ${serverCallId}`);
      return true;
    }

    const endpoint = this.configService.get<string>('OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const deployment = this.configService.get<string>('OPENAI_DEPLOYMENT') || 'gpt-realtime';

    // Debug logging
    this.logger.log(`[DEBUG] OPENAI_ENDPOINT = "${endpoint || 'NOT SET'}"`);
    this.logger.log(`[DEBUG] OPENAI_API_KEY = "${apiKey ? '***' + apiKey.slice(-4) : 'NOT SET'}"`);
    this.logger.log(`[DEBUG] OPENAI_DEPLOYMENT = "${deployment}"`);

    if (!endpoint || !apiKey) {
      this.logger.error('OpenAI endpoint or API key not configured');
      this.logger.error('Make sure .env file exists in project root with OPENAI_ENDPOINT and OPENAI_API_KEY');
      return false;
    }

    try {
      // Build WebSocket URL for Azure OpenAI Realtime
      const wsUrl = `${endpoint.replace('https://', 'wss://')}/openai/realtime?api-version=2024-10-01-preview&deployment=${deployment}`;

      this.logger.log(`Connecting to OpenAI Realtime: ${wsUrl}`);

      const ws = new WebSocket(wsUrl, {
        headers: {
          'api-key': apiKey,
        },
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

      // Set up event handlers
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
   * Configure the OpenAI Realtime session for TRUE Speech-to-Speech
   * Uses native OpenAI Realtime audio (not chained TTS)
   */
  private configureSession(serverCallId: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // CHAINED Architecture: OpenAI for transcription + text response, Azure Neural TTS for voice
    // This fixes the voice inconsistency bug in OpenAI's S2S audio output
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text'],  // TEXT ONLY - no S2S audio output (it has voice inconsistency bugs)
        instructions: `You are PM AI Bot, a helpful Project Manager assistant for Teams meetings. 
You listen to conversations and respond when someone says "Hey PM" or "Project Manager".
Keep responses concise and helpful. Focus on action items, summaries, and meeting assistance.
If you can see the user's screen, use that context to provide more relevant answers.
When describing what you see on screen, be specific about the content visible.

IMPORTANT: When someone asks you to write a report, create an email, or generate any document:
- Say something like "Sure, I'll create that for you. Give me just a moment." or "Got it, working on that report now."
- Keep it brief and friendly
- The document will automatically appear in the Workspace tab`,
        // NO voice config - we use Azure Neural TTS for audio output
        input_audio_format: 'pcm16',
        // NO output_audio_format - text only
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.8,
          prefix_padding_ms: 500,
          silence_duration_ms: 1500,
          create_response: false,  // Manual trigger on wake word
        },
      },
    };

    session.ws.send(JSON.stringify(sessionConfig));
    this.logger.log(`✅ Session configured (TEXT ONLY - Azure Neural TTS for voice): ${serverCallId}`);
  }

  /**
   * Send audio data to OpenAI Realtime (only if not speaking)
   */
  sendAudio(serverCallId: string, audioBase64: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // DON'T send audio while AI is speaking (prevents echo/cutoff)
    if (session.isSpeaking) {
      return;
    }

    const audioMessage = {
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    };

    session.ws.send(JSON.stringify(audioMessage));
    session.lastActivity = new Date();
  }

  /**
   * Handle messages from OpenAI Realtime
   */
  private handleOpenAIMessage(serverCallId: string, data: Buffer): void {
    const session = this.sessions.get(serverCallId);
    if (!session) return;

    try {
      const message = JSON.parse(data.toString());

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

        case 'conversation.item.input_audio_transcription.completed':
          this.handleTranscript(serverCallId, message.transcript);
          break;

        case 'response.audio.delta':
          // TRUE S2S: Send OpenAI Realtime's native audio directly to client
          if (!session.isSpeaking) {
            session.isSpeaking = true;
            this.logger.log(`🔊 PM S2S audio started: ${serverCallId}`);
            
            // Clear input audio buffer to prevent echo
            const clearBuffer = { type: 'input_audio_buffer.clear' };
            session.ws.send(JSON.stringify(clearBuffer));
            
            if (this.speakingStateChangedCallback) {
              this.speakingStateChangedCallback(serverCallId, true);
            }
          }
          
          // Send native S2S audio to client
          if (message.delta && this.audioResponseCallback) {
            this.audioResponseCallback(serverCallId, message.delta);
          }
          break;

        case 'response.audio_transcript.delta':
          // AI response transcript (partial) - for UI display
          if (message.delta && this.transcriptCallback) {
            this.transcriptCallback(serverCallId, message.delta, false);
          }
          break;

        case 'response.audio_transcript.done':
          // S2S transcript complete - for UI only (audio already streamed)
          this.logger.log(`📝 PM S2S transcript: "${message.transcript?.substring(0, 50)}..."`);
          if (message.transcript && this.transcriptCallback) {
            this.transcriptCallback(serverCallId, message.transcript, true);
          }
          break;

        // TEXT-ONLY RESPONSE HANDLERS (fallback if no audio)
        case 'response.text.delta':
          if (message.delta && this.transcriptCallback) {
            this.transcriptCallback(serverCallId, message.delta, false);
          }
          break;

        case 'response.text.done':
          this.logger.log(`📝 PM text response complete: ${serverCallId}`);
          if (message.text && this.pmTextResponseCallback) {
            this.pmTextResponseCallback(serverCallId, message.text);
          }
          break;

        case 'response.audio.done':
          // AI finished this audio segment
          this.logger.log(`Audio segment done: ${serverCallId}`);
          break;

        case 'response.done':
          // AI finished responding completely
          this.logger.log(`🔇 AI finished speaking: ${serverCallId}`);
          
          // Add a short delay before resuming input to allow audio playback to finish
          setTimeout(() => {
            const sess = this.sessions.get(serverCallId);
            if (sess) {
              sess.isSpeaking = false;
              this.logger.log(`🎤 Resuming audio input for: ${serverCallId}`);
              if (this.speakingStateChangedCallback) {
                this.speakingStateChangedCallback(serverCallId, false);
              }
            }
          }, 500); // 500ms delay after response.done
          break;

        case 'error':
          this.logger.error(`OpenAI error: ${JSON.stringify(message.error)}`);
          // Reset speaking state on error
          session.isSpeaking = false;
          break;

        default:
          // Log unknown message types for debugging
          if (message.type && !message.type.startsWith('response.content_part')) {
            this.logger.debug(`OpenAI message: ${message.type}`);
          }
      }
    } catch (error) {
      this.logger.error(`Error parsing OpenAI message: ${error.message}`);
    }
  }

  /**
   * Handle transcript and check for wake words
   */
  private async handleTranscript(serverCallId: string, transcript: string): Promise<void> {
    const session = this.sessions.get(serverCallId);
    if (!session || !transcript) return;

    this.logger.log(`Transcript [${serverCallId}]: ${transcript}`);

    // Store in transcript history
    session.transcript.push({
      role: 'user',
      text: transcript,
      timestamp: new Date(),
    });

    // Send to client
    if (this.transcriptCallback) {
      this.transcriptCallback(serverCallId, transcript, true);
    }

    // Check for wake words
    const hasPmWakeWord = this.pmWakeWordPatterns.some((pattern) =>
      pattern.test(transcript),
    );
    
    const hasClaudeWakeWord = this.claudeWakeWordPatterns.some((pattern) =>
      pattern.test(transcript),
    );

    // Claude takes priority if both are detected
    if (hasClaudeWakeWord && this.claudeRequestCallback) {
      this.logger.log(`🧠 CLAUDE WAKE WORD DETECTED in: "${transcript}"`);
      
      // Get vision context if available
      const visionContext = this.getVisionContextCallback ? this.getVisionContextCallback(serverCallId) : null;
      
      // Route to Claude
      await this.claudeRequestCallback(serverCallId, transcript, visionContext);
      return;
    }

    if (hasPmWakeWord) {
      this.logger.log(`🎯 PM WAKE WORD DETECTED in: "${transcript}"`);
      
      // Check if this is a DOCUMENT REQUEST - PM speaks via S2S, Claude builds silently
      const isDocumentRequest = /write\s+(me\s+)?(a\s+)?(status\s+)?report|create\s+(me\s+)?(a\s+)?report|generate\s+(me\s+)?(a\s+)?report|make\s+(me\s+)?(a\s+)?report|draft\s+(me\s+)?(an?\s+)?email|write\s+(me\s+)?(an?\s+)?email|create\s+(me\s+)?(a\s+)?summary|write\s+(me\s+)?(a\s+)?summary|summarize|summary\s+of|prepare\s+(me\s+)?(a\s+)?(report|summary|email)|give\s+me\s+(a\s+)?(report|summary)|can\s+you\s+(create|write|make|generate)\s+(me\s+)?(a\s+)?(report|summary|email)/i.test(transcript);
      
      this.logger.log(`📄 Checking document request: "${transcript}" => ${isDocumentRequest}`);
      
      if (isDocumentRequest && this.silentDocumentCallback) {
        this.logger.log(`📄 DOCUMENT REQUEST MATCHED: PM will speak (S2S), Claude builds silently`);
        
        // 1. PM speaks via S2S (OpenAI Realtime voice) - "I'll create that for you"
        this.triggerResponse(serverCallId);
        
        // 2. Claude builds document silently (no voice output) - use await to catch errors
        try {
          await this.silentDocumentCallback(serverCallId, transcript);
          this.logger.log(`📄 Silent document callback completed`);
        } catch (err) {
          this.logger.error(`📄 Silent document callback error:`, err);
        }
        
        return;
      }
      
      // Check if asking about screen/vision
      const isVisionQuestion = /see|screen|looking at|what('s| is) on|show|display|visible/i.test(transcript);
      
      if (isVisionQuestion && this.getVisionContextCallback) {
        const screenshot = this.getVisionContextCallback(serverCallId);
        if (screenshot) {
          this.logger.log(`📷 Vision question detected, analyzing screenshot...`);
          await this.triggerResponseWithVision(serverCallId, transcript, screenshot);
          return;
        }
      }
      
      this.triggerResponse(serverCallId);
    }
  }

  /**
   * Trigger AI to generate a response (basic, no vision)
   * Audio is generated but we'll use the transcript for TTS instead
   */
  triggerResponse(serverCallId: string): void {
    const session = this.sessions.get(serverCallId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(`Cannot trigger response - no active session for ${serverCallId}`);
      return;
    }

    this.logger.log(`🚀 TRIGGERING AI RESPONSE for ${serverCallId}`);

    // Need audio modality for OpenAI Realtime to work properly
    const responseCreate = {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
      },
    };

    session.ws.send(JSON.stringify(responseCreate));
  }

  /**
   * Trigger AI response with vision context
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
      // Analyze screenshot with GPT-4 Vision
      const visionDescription = await this.analyzeScreenshot(screenshotBase64, userQuestion);
      
      if (visionDescription) {
        this.logger.log(`📷 Vision analysis: ${visionDescription.substring(0, 100)}...`);
        
        // Add vision context as a conversation item
        const contextItem = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `[SCREEN CONTEXT: ${visionDescription}]\n\nThe user asked: "${userQuestion}"`,
              },
            ],
          },
        };
        session.ws.send(JSON.stringify(contextItem));
      }

      // Trigger response
      const responseCreate = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
        },
      };
      session.ws.send(JSON.stringify(responseCreate));
      
    } catch (error) {
      this.logger.error(`Vision analysis failed: ${error.message}`);
      // Fall back to regular response
      this.triggerResponse(serverCallId);
    }
  }

  /**
   * Analyze screenshot using GPT-4 Vision
   */
  private async analyzeScreenshot(screenshotBase64: string, userQuestion: string): Promise<string | null> {
    const endpoint = this.configService.get<string>('OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!endpoint || !apiKey) {
      return null;
    }

    try {
      // Remove data URL prefix if present
      const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      
      // Use GPT-4 Vision (try gpt-4.1 first, then gpt-4o)
      const visionDeployments = ['gpt-4.1', 'gpt-4o', 'gpt-4-vision'];
      
      for (const deployment of visionDeployments) {
        const visionUrl = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`;
        
        try {
          const response = await fetch(visionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content: 'You are helping a meeting assistant describe what is visible on a shared screen. Be concise but specific about what you see - text, applications, data, charts, presentations, etc.',
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `The user asked: "${userQuestion}". Describe what you see on this screen that would help answer their question.`,
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/jpeg;base64,${base64Data}`,
                      },
                    },
                  ],
                },
              ],
              max_tokens: 500,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
          }
        } catch (e) {
          this.logger.debug(`Vision deployment ${deployment} failed: ${e.message}`);
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Screenshot analysis error: ${error.message}`);
      return null;
    }
  }

  /**
   * End a session
   */
  endSession(serverCallId: string): void {
    const session = this.sessions.get(serverCallId);
    if (session?.ws) {
      session.ws.close();
    }
    this.sessions.delete(serverCallId);
    this.logger.log(`Session ended: ${serverCallId}`);
  }

  /**
   * Get transcript for a session
   */
  getTranscript(serverCallId: string): Array<{ role: string; text: string; timestamp: Date }> {
    return this.sessions.get(serverCallId)?.transcript || [];
  }

  /**
   * Get session status
   */
  getSessionStatus(serverCallId: string): any {
    const session = this.sessions.get(serverCallId);
    if (!session) return null;

    return {
      serverCallId,
      isConnected: session.isConnected,
      isSpeaking: session.isSpeaking,
      transcriptCount: session.transcript.length,
      lastActivity: session.lastActivity,
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
