import { createHash } from "node:crypto";
import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { type Bot, InlineKeyboard } from "grammy";
import { RadarConfig } from "../config/config";
import { DatabaseService } from "../database/database";
import { DiscoveryAutomation } from "../discovery/discovery-automation";
import { IngestionPipeline } from "../ingestion/pipeline";
import { ManualTextAdapter } from "../sources/adapters";
import { ManualUrlService } from "../sources/manual-url.service";
import { createTelegramBot } from "./bot-client";
import {
  effectiveFeedbackAction,
  type FeedbackAction,
  presentFeedback,
} from "./feedback-presentation";
import { assessManualSubmission } from "./manual-submission";
import { formatDiscoveryRunSummary } from "./discovery-summary";
import {
  formatJobsPage,
  jobsPageKeyboard,
  parseJobsPageCallback,
} from "./jobs-presentation";
import { formatSourceSummary } from "./source-summary";

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private bot?: Bot;
  private readonly awaitingText = new Map<string, number>();
  constructor(
    @Inject(RadarConfig) private readonly config: RadarConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(IngestionPipeline) private readonly pipeline: IngestionPipeline,
    @Inject(ManualUrlService) private readonly manualUrls: ManualUrlService,
    @Inject(DiscoveryAutomation)
    private readonly discovery: DiscoveryAutomation,
  ) {}
  async onModuleInit(): Promise<void> {
    const token = this.config.env.TELEGRAM_BOT_TOKEN;
    if (!token || !this.config.env.TELEGRAM_POLLING_ENABLED) return;
    const chats = new Set(
      this.config.env.TELEGRAM_ALLOWED_CHAT_IDS.split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
    const mapping = new Map(
      this.config.env.TELEGRAM_USER_PROFILE_MAP.split(",")
        .filter(Boolean)
        .map((entry) => {
          const [user, profiles = ""] = entry.split("=");
          return [user, new Set(profiles.split("|"))] as const;
        }),
    );
    this.bot = createTelegramBot(token, this.config.env.TELEGRAM_PROXY_URL);
    this.bot.use(async (ctx, next) => {
      if (
        !ctx.from ||
        !mapping.has(String(ctx.from.id)) ||
        !ctx.chat ||
        !chats.has(String(ctx.chat.id))
      ) {
        if (ctx.callbackQuery)
          await ctx.answerCallbackQuery({ text: "Доступ запрещён" });
        return;
      }
      await next();
    });
    this.bot.command(["start", "help"], (ctx) =>
      ctx.reply(
        "Команды: /search, /searchstatus, /jobs, /add <url>, /addtext, /latest, /stats, /profile, /sources",
      ),
    );
    this.bot.command("search", async (ctx) => {
      await ctx.reply("Запускаю поиск для cnstbmb и lanok…");
      try {
        const summary = await this.discovery.runNow("manual");
        await ctx.reply(formatDiscoveryRunSummary(summary));
      } catch {
        await ctx.reply(
          "Автопоиск недоступен. Проверьте /sources и BRAVE_SEARCH_API_KEY.",
        );
      }
    });
    this.bot.command("searchstatus", async (ctx) => {
      const status = this.discovery.status();
      if (!status.enabled) {
        await ctx.reply("Автопоиск выключен");
        return;
      }
      const state = status.running ? "выполняется" : "ожидает расписания";
      await ctx.reply(
        status.lastSummary
          ? `${state}. Последний запуск:\n${formatDiscoveryRunSummary(status.lastSummary)}`
          : `${state}. Завершённых запусков ещё нет.`,
      );
    });
    this.bot.command("stats", async (ctx) =>
      ctx.reply(JSON.stringify(await this.db.stats())),
    );
    this.bot.command("latest", async (ctx) => {
      const allowed = mapping.get(String(ctx.from!.id)) ?? new Set<string>();
      const rows = (await this.db.latest()).filter((row) =>
        allowed.has(row.candidateId),
      );
      await ctx.reply(
        rows.length
          ? rows
              .map(
                (row) =>
                  `${row.candidateId}: ${row.score}/${row.verdict} · ${row.title} — ${row.company}, ${row.city}`,
              )
              .join("\n\n")
          : "Пока нет анализов",
      );
    });
    this.bot.command("jobs", async (ctx) => {
      const allowed = [...(mapping.get(String(ctx.from!.id)) ?? [])];
      const page = await this.db.listJobsPage(0, 10, allowed);
      const replyMarkup = jobsPageKeyboard(page);
      await ctx.reply(
        formatJobsPage(page),
        replyMarkup ? { reply_markup: replyMarkup } : undefined,
      );
    });
    this.bot.command("profile", (ctx) =>
      ctx.reply(
        `Доступные профили: ${[...(mapping.get(String(ctx.from!.id)) ?? [])].join(", ")}`,
      ),
    );
    this.bot.command("sources", (ctx) =>
      ctx.reply(formatSourceSummary(this.config.sourcePolicies)),
    );
    this.bot.command("add", async (ctx) => {
      const url = ctx.match.trim();
      if (!url) {
        await ctx.reply("Формат: /add https://...");
        return;
      }
      try {
        const result = await this.manualUrls.submit(url);
        if (result.disposition === "ingested")
          await ctx.reply(
            `Ссылка обработана: ${result.results[0]?.jobId ?? "вакансия отклонена"}`,
          );
        else
          await ctx.reply(
            `Ссылка сохранена как pending_manual (${result.id}, ${result.reason}). Пришлите текст через /addtext.`,
          );
      } catch {
        await ctx.reply(
          "Не удалось обработать URL. Проверьте адрес или source policy.",
        );
      }
    });
    this.bot.command("addtext", async (ctx) => {
      this.awaitingText.set(
        `${ctx.chat.id}:${ctx.from!.id}`,
        Date.now() + 5 * 60_000,
      );
      await ctx.reply(
        "Пришлите полное объявление конкретной вакансии следующим сообщением: название, компания, обязанности и требования (до 1 MiB, окно 5 минут). Критерии поиска сюда присылать не нужно — /addtext не запускает поиск.",
      );
    });
    this.bot.on("message:text", async (ctx, next) => {
      if (ctx.message.text.startsWith("/")) {
        await next();
        return;
      }
      const key = `${ctx.chat.id}:${ctx.from.id}`;
      const expires = this.awaitingText.get(key);
      if (!expires || expires < Date.now()) {
        this.awaitingText.delete(key);
        await next();
        return;
      }
      this.awaitingText.delete(key);
      if (
        Buffer.byteLength(ctx.message.text) >
        this.config.env.RAW_INPUT_MAX_BYTES
      ) {
        await ctx.reply("Текст слишком большой");
        return;
      }
      const decision = assessManualSubmission(ctx.message.text);
      if (decision.kind === "search_brief") {
        await ctx.reply(decision.message);
        return;
      }
      const result = await this.pipeline.run(
        new ManualTextAdapter({
          text: ctx.message.text,
          rawKind: "text",
          metadata: { telegram: true },
        }),
      );
      await ctx.reply(
        `Вакансия обработана: ${result[0]?.jobId ?? "отклонена"}`,
      );
    });
    this.bot.callbackQuery(/^jobs:(\d{1,4})$/, async (ctx) => {
      const requestedPage = parseJobsPageCallback(ctx.callbackQuery.data);
      if (requestedPage === undefined) {
        await ctx.answerCallbackQuery({ text: "Некорректная страница" });
        return;
      }
      const allowed = [...(mapping.get(String(ctx.from.id)) ?? [])];
      const page = await this.db.listJobsPage(requestedPage, 10, allowed);
      const replyMarkup = jobsPageKeyboard(page);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        formatJobsPage(page),
        replyMarkup ? { reply_markup: replyMarkup } : undefined,
      );
    });
    this.bot.callbackQuery(
      /^(interest|dismiss|applied|closed):([a-z0-9_-]+):([0-9a-f-]+)$/i,
      async (ctx) => {
        const [, action, candidateId, jobId] = ctx.match;
        if (!mapping.get(String(ctx.from.id))?.has(candidateId!)) {
          await ctx.answerCallbackQuery({ text: "Нет доступа к профилю" });
          return;
        }
        const currentJobStatus = await this.db.jobStatus(jobId!);
        const effectiveAction = effectiveFeedbackAction(
          action as FeedbackAction,
          currentJobStatus,
        );
        if (effectiveAction === "closed" && currentJobStatus !== "closed")
          await this.db.closeJob(jobId!);
        else if (effectiveAction !== "closed")
          await this.db.setFeedback(
            candidateId!,
            jobId!,
            effectiveAction === "interest"
              ? "interested"
              : effectiveAction === "dismiss"
                ? "dismissed"
                : "applied",
            createHash("sha256").update(String(ctx.from.id)).digest("hex"),
          );
        const presentation = presentFeedback(
          ctx.callbackQuery.message?.text ?? "",
          effectiveAction,
          candidateId!,
          jobId!,
        );
        await ctx.answerCallbackQuery({
          text:
            currentJobStatus === "closed"
              ? "Вакансия уже закрыта"
              : presentation.toast,
        });
        const currentText = ctx.callbackQuery.message?.text;
        if (currentText && currentText !== presentation.text) {
          if (effectiveAction === "closed") await ctx.editMessageReplyMarkup();
          await ctx.editMessageText(
            presentation.text,
            presentation.replyMarkup
              ? { reply_markup: presentation.replyMarkup }
              : undefined,
          );
        }
      },
    );
    this.bot.catch((error) =>
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "telegram.error", message: error.message })}\n`,
      ),
    );
    void this.bot.start({ allowed_updates: ["message", "callback_query"] });
  }
  keyboard(candidateId: string, jobId: string): InlineKeyboard {
    return new InlineKeyboard()
      .text("Интересно", `interest:${candidateId}:${jobId}`)
      .text("Мимо", `dismiss:${candidateId}:${jobId}`)
      .row()
      .text("Откликнулся", `applied:${candidateId}:${jobId}`)
      .text("Закрыта", `closed:${candidateId}:${jobId}`);
  }
  async onApplicationShutdown(): Promise<void> {
    await this.bot?.stop();
  }
}
