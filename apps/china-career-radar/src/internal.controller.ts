import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { RadarConfig } from "./config/config";
import { DatabaseService } from "./database/database";
import { IngestionPipeline } from "./ingestion/pipeline";
import { ManualTextAdapter } from "./sources/adapters";
import { ManualUrlService } from "./sources/manual-url.service";

const textBody = z.object({
  text: z.string().min(20).max(1_048_576),
  title: z.string().max(300).optional(),
  company: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  url: z.url().optional(),
});
const urlBody = z.object({ url: z.url().max(2048) });

@Controller("internal")
export class InternalController {
  constructor(
    @Inject(RadarConfig) private readonly config: RadarConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(IngestionPipeline) private readonly pipeline: IngestionPipeline,
    @Inject(ManualUrlService) private readonly manualUrls: ManualUrlService,
  ) {}
  private authorize(token?: string): void {
    if (
      !this.config.env.INTERNAL_API_TOKEN ||
      token !== this.config.env.INTERNAL_API_TOKEN
    )
      throw new UnauthorizedException();
  }
  @Post("jobs/manual-text") async addText(
    @Headers("x-internal-token") token: string | undefined,
    @Body() unknownBody: unknown,
  ) {
    this.authorize(token);
    const body = textBody.parse(unknownBody);
    return this.pipeline.run(
      new ManualTextAdapter({
        text: body.text,
        title: body.title,
        company: body.company,
        city: body.city,
        canonicalUrl: body.url,
        rawKind: "text",
        metadata: {},
      }),
    );
  }
  @Post("jobs/manual-url") async addUrl(
    @Headers("x-internal-token") token: string | undefined,
    @Body() unknownBody: unknown,
  ) {
    this.authorize(token);
    const { url } = urlBody.parse(unknownBody);
    return this.manualUrls.submit(url);
  }
  @Get("stats") async stats(
    @Headers("x-internal-token") token: string | undefined,
  ) {
    this.authorize(token);
    return this.db.stats();
  }
}
