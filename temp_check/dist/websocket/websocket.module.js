"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const websocket_gateway_1 = require("./websocket.gateway");
const websocket_service_1 = require("./websocket.service");
const audio_streaming_service_1 = require("./audio-streaming.service");
const claude_service_1 = require("./claude.service");
const tts_service_1 = require("./tts.service");
const file_output_service_1 = require("./file-output.service");
const dataverse_service_1 = require("./dataverse.service");
const openai_realtime_service_1 = require("./openai-realtime.service");
let WebSocketModule = class WebSocketModule {
};
exports.WebSocketModule = WebSocketModule;
exports.WebSocketModule = WebSocketModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [
            websocket_gateway_1.WebSocketGateway,
            websocket_service_1.WebSocketService,
            audio_streaming_service_1.AudioStreamingService,
            openai_realtime_service_1.OpenAIRealtimeService,
            claude_service_1.ClaudeService,
            tts_service_1.TTSService,
            file_output_service_1.FileOutputService,
            dataverse_service_1.DataverseService,
        ],
        exports: [
            websocket_gateway_1.WebSocketGateway,
            websocket_service_1.WebSocketService,
            audio_streaming_service_1.AudioStreamingService,
            openai_realtime_service_1.OpenAIRealtimeService,
            claude_service_1.ClaudeService,
            tts_service_1.TTSService,
            file_output_service_1.FileOutputService,
            dataverse_service_1.DataverseService,
        ],
    })
], WebSocketModule);
//# sourceMappingURL=websocket.module.js.map