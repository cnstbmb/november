import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const ALLOWED_ORIGINS = ['https://tonem.ru', 'https://www.tonem.ru'];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, server-to-server) with no Origin header.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`), false);
      }
    },
    methods: ['GET'],
    credentials: false,
  });

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
