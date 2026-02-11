"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallAutomationModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const call_automation_service_1 = require("./call-automation.service");
const call_automation_controller_1 = require("./call-automation.controller");
const websocket_module_1 = require("../websocket/websocket.module");
let CallAutomationModule = class CallAutomationModule {
};
exports.CallAutomationModule = CallAutomationModule;
exports.CallAutomationModule = CallAutomationModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, websocket_module_1.WebSocketModule],
        controllers: [call_automation_controller_1.CallAutomationController],
        providers: [call_automation_service_1.CallAutomationService],
        exports: [call_automation_service_1.CallAutomationService],
    })
], CallAutomationModule);
//# sourceMappingURL=call-automation.module.js.map