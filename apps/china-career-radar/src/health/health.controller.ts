import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database";

@Controller("health")
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  @Get("live") live(): { status: "ok" } {
    return { status: "ok" };
  }
  @Get("ready") async ready(): Promise<{ status: "ok" }> {
    try {
      await this.db.ping();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
  }
}
