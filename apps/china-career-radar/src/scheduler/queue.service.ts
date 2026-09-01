import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { RadarConfig } from "../config/config";

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private boss?: PgBoss;
  constructor(@Inject(RadarConfig) private readonly config: RadarConfig) {}
  async onModuleInit(): Promise<void> {
    if (!this.config.env.QUEUE_ENABLED) return;
    this.boss = new PgBoss({
      connectionString: this.config.env.DATABASE_URL,
      schema: "pgboss",
    });
    this.boss.on("error", (error) =>
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "pgboss.error", message: error.message })}\n`,
      ),
    );
    await this.boss.start();
    await this.boss.createQueue("analysis-dead-letter");
    await this.boss.createQueue("analysis", {
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 300,
      expireInSeconds: 300,
      retentionSeconds: 86400,
      deleteAfterSeconds: 604800,
      deadLetter: "analysis-dead-letter",
    });
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.boss) await this.boss.stop({ graceful: true, timeout: 10_000 });
  }
}
