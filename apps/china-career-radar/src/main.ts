import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { RadarConfig } from "./config/config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const config = app.get(RadarConfig);
  app.enableShutdownHooks();
  await app.listen(config.env.PORT, config.env.HOST);
  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "app.started", host: config.env.HOST, port: config.env.PORT, analyzer: config.env.ANALYZER_PROVIDER, workerLocation: config.env.WORKER_LOCATION })}\n`,
  );
}

void bootstrap();
