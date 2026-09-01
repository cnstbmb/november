import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { RadarConfig } from "./config/config";
import { DatabaseService } from "./database/database";
import { IngestionPipeline } from "./ingestion/pipeline";
import { ChinaJobFixtureAdapter, ManualTextAdapter } from "./sources/adapters";
import { ManualUrlService } from "./sources/manual-url.service";

const valueAfter = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main(): Promise<void> {
  process.env.QUEUE_ENABLED ??= "false";
  process.env.TELEGRAM_POLLING_ENABLED = "false";
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const command = process.argv[2] ?? "help";
    const pipeline = app.get(IngestionPipeline);
    const db = app.get(DatabaseService);
    const config = app.get(RadarConfig);
    const manualUrls = app.get(ManualUrlService);
    if (command === "demo") {
      const fixture =
        valueAfter("--fixture") === "chinajob-senior-frontend-updated"
          ? "senior-frontend-updated.html"
          : "senior-frontend.html";
      process.stdout.write(
        `${JSON.stringify(await pipeline.run(new ChinaJobFixtureAdapter(fixture)), null, 2)}\n`,
      );
      return;
    }
    if (command === "add-text") {
      const file = valueAfter("--file");
      if (!file) throw new Error("usage:add-text --file <path>");
      const text = await readFile(file, "utf8");
      process.stdout.write(
        `${JSON.stringify(await pipeline.run(new ManualTextAdapter({ text, title: valueAfter("--title"), company: valueAfter("--company"), city: valueAfter("--city"), canonicalUrl: valueAfter("--url"), rawKind: "text", metadata: {} })), null, 2)}\n`,
      );
      return;
    }
    if (command === "add-url") {
      const url = process.argv[3];
      if (!url) throw new Error("usage:add-url <https-url>");
      process.stdout.write(
        `${JSON.stringify(await manualUrls.submit(url), null, 2)}\n`,
      );
      return;
    }
    if (command === "stats") {
      process.stdout.write(`${JSON.stringify(await db.stats(), null, 2)}\n`);
      return;
    }
    if (command === "profile") {
      const id = process.argv[3];
      const profiles = id
        ? config.profiles.filter((profile) => profile.id === id)
        : config.profiles;
      process.stdout.write(
        `${JSON.stringify(
          profiles.map(({ contentHash, analyzerProjection, ...profile }) => ({
            ...profile,
            contentHash,
            analyzerProjection,
          })),
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(
      "Commands: demo, add-text --file <path>, add-url <url>, stats, profile [id]\n",
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ level: "error", event: "cli.failed", message: error instanceof Error ? error.message : "unknown" })}\n`,
  );
  process.exitCode = 1;
});
