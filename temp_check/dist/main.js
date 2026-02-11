"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const platform_ws_1 = require("@nestjs/platform-ws");
const app_module_1 = require("./app.module");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: true,
        credentials: true,
    });
    app.useWebSocketAdapter(new platform_ws_1.WsAdapter(app));
    app.useStaticAssets((0, path_1.join)(__dirname, '..', 'public'));
    await app.listen(process.env.PORT ?? 3000);
    console.log(`Application running: http://localhost:${process.env.PORT ?? 3000}`);
    console.log(`WebSocket: ws://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
//# sourceMappingURL=main.js.map