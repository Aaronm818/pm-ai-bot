import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS for browser clients
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useWebSocketAdapter(new WsAdapter(app));
  app.useStaticAssets(join(process.cwd(), 'public'));

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application running: http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`WebSocket: ws://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
