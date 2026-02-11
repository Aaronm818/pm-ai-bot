"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ClaudeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ClaudeService = ClaudeService_1 = class ClaudeService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(ClaudeService_1.name);
        this.conversationHistory = new Map();
        this.getCachedDataCallback = null;
        this.documentPatterns = {
            report: [
                /write\s+(me\s+)?(a\s+)?status\s+report/i,
                /create\s+(a\s+)?report/i,
                /generate\s+(a\s+)?report/i,
                /make\s+(me\s+)?(a\s+)?report/i,
                /prepare\s+(a\s+)?report/i,
                /give\s+me\s+(a\s+)?report/i,
                /status\s+report/i,
                /case\s+report/i,
                /weekly\s+report/i,
                /daily\s+report/i,
            ],
            email: [
                /write\s+(me\s+)?(an?\s+)?email/i,
                /draft\s+(an?\s+)?email/i,
                /create\s+(an?\s+)?email/i,
                /compose\s+(an?\s+)?email/i,
                /prepare\s+(an?\s+)?email/i,
                /send\s+(an?\s+)?email/i,
                /email\s+(about|regarding|for)/i,
            ],
            summary: [
                /write\s+(me\s+)?(a\s+)?summary/i,
                /summarize/i,
                /create\s+(a\s+)?summary/i,
                /give\s+me\s+(a\s+)?summary/i,
                /prepare\s+(a\s+)?summary/i,
                /recap/i,
                /overview\s+of/i,
            ],
        };
        this.guardrailPatterns = {
            outOfScope: [
                { pattern: /medical\s+(advice|help|question)|diagnos|symptom|prescription|doctor|medicine|treatment/i, response: "I'm a project management assistant, so I can't help with medical questions. Please consult a healthcare professional." },
                { pattern: /legal\s+(advice|help|question)|lawyer|attorney|lawsuit|sue\s|court\s|litigation/i, response: "I'm not able to provide legal advice. For legal matters, please consult with your legal team or an attorney." },
                { pattern: /invest(ment|ing)?|stock|crypto|trading\s+advice|financial\s+advice|buy\s+stock/i, response: "I can't provide investment or financial advice. Please consult a financial advisor for those questions." },
                { pattern: /password|login\s+credentials|api\s+key|secret\s+key|access\s+token/i, response: "I can't help with passwords or credentials for security reasons. Please contact IT support." },
                { pattern: /personal\s+(opinion|feelings?)\s+(about|on)\s+\w+\s*(person|employee|colleague|coworker|team\s*member)?/i, response: "I don't provide personal opinions about team members. I can share factual project information only." },
                { pattern: /what\s+do\s+you\s+think\s+(about|of)\s+\w+\s*(as\s+a\s+person|personally)/i, response: "I don't provide personal opinions about individuals. I can help with project-related information." },
                { pattern: /therapy|therapist|counseling|mental\s+health\s+advice|depression|anxiety\s+treatment/i, response: "I'm a PM assistant and can't provide mental health advice. Please reach out to a mental health professional or your HR department for support resources." },
                { pattern: /relationship\s+advice|dating|marriage\s+advice/i, response: "I'm focused on project management and can't help with personal relationship advice." },
            ],
        };
        this.logger.log('Claude Service initialized (with document generation)');
    }
    setCachedDataCallback(callback) {
        this.getCachedDataCallback = callback;
        this.logger.log('✅ Cached data callback set');
    }
    checkGuardrails(message) {
        for (const guardrail of this.guardrailPatterns.outOfScope) {
            if (guardrail.pattern.test(message)) {
                this.logger.log(`🛡️ GUARDRAIL: Out of scope request blocked - "${message.substring(0, 50)}..."`);
                return {
                    triggered: true,
                    type: 'out_of_scope',
                    response: guardrail.response,
                };
            }
        }
        return null;
    }
    detectDocumentRequest(message) {
        const lowerMessage = message.toLowerCase();
        for (const [docType, patterns] of Object.entries(this.documentPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(message)) {
                    const topic = this.extractTopic(message, docType);
                    this.logger.log(`📄 Document request detected: ${docType} about "${topic}"`);
                    return { type: docType, topic };
                }
            }
        }
        return null;
    }
    extractTopic(message, docType) {
        let topic = message
            .replace(/^(hey\s+)?(claude|pm|project\s*manager)[\s,]*/i, '')
            .replace(/^(can\s+you\s+|could\s+you\s+|please\s+|would\s+you\s+)/i, '')
            .replace(/^(write|create|draft|generate|make|prepare|give)\s+(me\s+)?/i, '')
            .replace(/^(a|an|the)\s+/i, '')
            .replace(/^(status\s+)?report\s+(on|about|for|regarding)?\s*/i, '')
            .replace(/^email\s+(about|regarding|for|to)?\s*/i, '')
            .replace(/^summary\s+(of|about|for|regarding)?\s*/i, '')
            .trim();
        if (!topic || topic.length < 3) {
            switch (docType) {
                case 'report': return 'current cases';
                case 'email': return 'follow-up';
                case 'summary': return 'activities';
                default: return 'general';
            }
        }
        return topic;
    }
    generateTitle(docType, topic) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        switch (docType) {
            case 'report':
                return `Status Report - ${this.capitalize(topic)} (${dateStr})`;
            case 'email':
                return `Email Draft - ${this.capitalize(topic)}`;
            case 'summary':
                return `Summary - ${this.capitalize(topic)} (${dateStr})`;
            default:
                return `Document - ${this.capitalize(topic)}`;
        }
    }
    capitalize(str) {
        return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    }
    async chat(sessionId, userMessage, visionContext) {
        const apiKey = this.configService.get('CLAUDE_API_KEY');
        const deployment = this.configService.get('CLAUDE_DEPLOYMENT', 'claude-haiku-4-5');
        const endpoint = this.configService.get('CLAUDE_ENDPOINT');
        if (!apiKey || !endpoint) {
            return { text: '', error: 'Claude API not configured' };
        }
        const guardrailResult = this.checkGuardrails(userMessage);
        if (guardrailResult) {
            this.logger.log(`🛡️ Guardrail triggered: ${guardrailResult.type}`);
            return {
                text: guardrailResult.response,
                guardrail: {
                    triggered: true,
                    type: guardrailResult.type,
                    message: guardrailResult.response,
                },
            };
        }
        const docRequest = this.detectDocumentRequest(userMessage);
        if (docRequest) {
            return this.generateDocument(sessionId, userMessage, docRequest, apiKey, deployment, endpoint);
        }
        return this.generateVoiceResponse(sessionId, userMessage, visionContext, apiKey, deployment, endpoint);
    }
    async generateDocument(sessionId, userMessage, docRequest, apiKey, deployment, endpoint) {
        const cachedData = this.getCachedDataCallback ? this.getCachedDataCallback() : 'No case data available.';
        const documentPrompts = {
            report: `You are a professional PM assistant creating a status report.

CURRENT CASE DATA:
${cachedData}

Create a well-formatted status report with these sections:
- Title and date
- Executive Summary (2-3 sentences)
- High Priority Items (with status and details)
- Medium/Low Priority Items
- Recommendations or Next Steps
- Signature line

Use markdown formatting (headers, bold, bullet points).
Be professional but concise. Focus on actionable information.`,
            email: `You are a professional PM assistant drafting an email.

CURRENT CASE DATA:
${cachedData}

Create a professional email with:
- Subject line (prefix with "Subject: ")
- Professional greeting
- Clear, concise body explaining the issue/update
- Specific action items or requests
- Professional closing

Be concise but include all necessary details.
Use a professional but friendly tone.`,
            summary: `You are a professional PM assistant creating a summary.

CURRENT CASE DATA:
${cachedData}

Create a concise summary including:
- Overview (what this summary covers)
- Key Points (bullet points)
- Current Status
- Notable Items requiring attention

Use markdown formatting.
Keep it brief but comprehensive.`,
        };
        const systemPrompt = documentPrompts[docRequest.type];
        const title = this.generateTitle(docRequest.type, docRequest.topic);
        try {
            const url = `${endpoint.replace(/\/$/, '')}/anthropic/v1/messages`;
            this.logger.log(`📄 Generating ${docRequest.type}: "${title}"`);
            const startTime = Date.now();
            const requestBody = {
                model: deployment,
                max_tokens: 1500,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `Please create a ${docRequest.type} about: ${docRequest.topic}\n\nOriginal request: "${userMessage}"`,
                    },
                ],
            };
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Claude API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const elapsed = Date.now() - startTime;
            const textBlocks = data.content.filter((block) => block.type === 'text');
            const documentContent = textBlocks.map((block) => block.text).join('\n');
            this.logger.log(`📄 Document generated (${documentContent.length} chars) in ${elapsed}ms`);
            return {
                text: `I've created a ${docRequest.type} for you about ${docRequest.topic}. You can view it in the Workspace tab.`,
                document: {
                    type: docRequest.type,
                    title: title,
                    content: documentContent,
                },
            };
        }
        catch (error) {
            this.logger.error(`Document generation error: ${error.message}`);
            return { text: `Sorry, I couldn't create that ${docRequest.type}. Please try again.`, error: error.message };
        }
    }
    async generateVoiceResponse(sessionId, userMessage, visionContext, apiKey, deployment, endpoint) {
        if (!this.conversationHistory.has(sessionId)) {
            this.conversationHistory.set(sessionId, []);
        }
        const history = this.conversationHistory.get(sessionId);
        let messageContent = userMessage;
        if (visionContext) {
            messageContent = `[SCREEN CONTEXT: ${visionContext}]\n\n${userMessage}`;
        }
        history.push({ role: 'user', content: messageContent });
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }
        const cachedData = this.getCachedDataCallback ? this.getCachedDataCallback() : 'No case data available.';
        const systemPrompt = `You are a PM voice assistant in a meeting bot. Users speak to you and hear your response out loud.

CRITICAL VOICE RULES:
- Be extremely concise: 1-2 sentences max for simple questions, 3-4 sentences max for complex ones
- NO markdown: no asterisks, no bullet points, no numbered lists, no headers
- Speak naturally like a helpful colleague, not a written document
- Never say "Here's" or "Here are" - just give the answer directly
- For case/ticket queries: state the count and briefly mention the top 1-2 items only

GUARDRAILS - WHAT YOU CANNOT DO:
1. ACTIONS: You CANNOT actually do things in systems. You cannot approve budgets, close cases, send emails, change deadlines, assign tasks, or modify any data. If asked to DO something, say: "I can only provide information. I can't actually [action] - you'll need to do that yourself or ask your PM."

2. MADE-UP DATA: You can ONLY reference data from the CURRENT CASE DATA below. If asked about something not in that data, say: "I don't have that information in my current data. I can only see the cases loaded from Dataverse."

3. OUT OF SCOPE: You are a PM assistant ONLY. You cannot give medical advice, legal advice, financial advice, or personal opinions about people. If asked, say: "That's outside my scope as a PM assistant. I can help with cases, tasks, and project information."

DOCUMENT CREATION:
If users ask you to write reports, emails, or summaries, tell them you'll create it and they can view it in the Workspace. This is the ONE exception - you CAN generate documents.

CURRENT CASE DATA (live from Dataverse):
${cachedData}

Use the case data above when users ask about cases, tickets, issues, or support requests.

Example good responses:
- "You have 4 open cases. The most urgent is a login issue reported today."
- "I can't actually approve budgets - I can only provide information. You'll need to get approval from Guillermo."
- "I don't have sales data in my current view. I can only see support cases from Dataverse."

Example bad responses:
- "Sure, I've approved the budget for you." (WRONG - can't take actions)
- "The project will cost about $50,000." (WRONG - making up data)
- "I think you should fire that employee." (WRONG - out of scope)`;
        try {
            const url = `${endpoint.replace(/\/$/, '')}/anthropic/v1/messages`;
            this.logger.log(`🧠 Calling Claude (voice response)...`);
            const startTime = Date.now();
            const requestBody = {
                model: deployment,
                max_tokens: 300,
                system: systemPrompt,
                messages: history.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
            };
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Claude API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const elapsed = Date.now() - startTime;
            const textBlocks = data.content.filter((block) => block.type === 'text');
            const assistantMessage = textBlocks.map((block) => block.text).join('\n');
            history.push({ role: 'assistant', content: assistantMessage });
            this.logger.log(`🧠 Claude response (${assistantMessage.length} chars) in ${elapsed}ms`);
            return { text: assistantMessage };
        }
        catch (error) {
            this.logger.error(`Claude error: ${error.message}`);
            history.pop();
            return { text: '', error: error.message };
        }
    }
    clearHistory(sessionId) {
        this.conversationHistory.delete(sessionId);
    }
    getHistory(sessionId) {
        return this.conversationHistory.get(sessionId) || [];
    }
};
exports.ClaudeService = ClaudeService;
exports.ClaudeService = ClaudeService = ClaudeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClaudeService);
//# sourceMappingURL=claude.service.js.map