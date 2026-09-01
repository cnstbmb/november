import type { JobAnalysis, JobCard, NormalizedJob, Notifier } from "../domain";
import { type Bot, InlineKeyboard } from "grammy";
import { createTelegramBot } from "../telegram/bot-client";

export function formatJobCard(
  analysisId: string,
  jobId: string,
  candidateId: string,
  job: NormalizedJob,
  analysis: JobAnalysis,
  updated: boolean,
): JobCard {
  const salary = job.salaryMin
    ? `${job.salaryMin}${job.salaryMax ? `–${job.salaryMax}` : ""} ${job.salaryCurrency ?? ""}/${job.salaryPeriod ?? ""}`
    : "не указана";
  const sourceLabel =
    job.sourceId === "manual" ? "добавлено вручную" : job.sourceId;
  return {
    analysisId,
    candidateId,
    jobId,
    updated,
    text: [
      updated ? "🔄 Обновление" : "🎯 Новая вакансия",
      `Кандидат: ${candidateId}`,
      `${analysis.fitScore}/100 · ${analysis.verdict}`,
      `${job.title} — ${job.company}`,
      `📍 ${job.city} · 💰 ${salary}`,
      `Почему: ${analysis.reasons.join("; ")}`,
      `Риски: ${analysis.risks.join("; ") || "не выявлены"}`,
      `Work Permit: ${analysis.visa.status}/${analysis.visa.workPermitRisk}`,
      `Источник: ${sourceLabel}`,
      `ID вакансии: ${jobId}`,
      job.canonicalUrl ?? "Ссылка не указана",
    ].join("\n"),
  };
}

export class ConsoleNotifier implements Notifier {
  readonly channel = "console";
  async notify(card: JobCard): Promise<{ externalId?: string }> {
    process.stdout.write(`${card.text}\n`);
    return { externalId: `console:${card.analysisId}` };
  }
}

export class TelegramNotifier implements Notifier {
  readonly channel = "telegram";
  private readonly bot: Bot;
  constructor(token: string, proxyUrl = "") {
    this.bot = createTelegramBot(token, proxyUrl);
  }
  async notify(
    card: JobCard,
    destination: string,
  ): Promise<{ externalId?: string }> {
    const keyboard = new InlineKeyboard()
      .text("Интересно", `interest:${card.candidateId}:${card.jobId}`)
      .text("Мимо", `dismiss:${card.candidateId}:${card.jobId}`)
      .row()
      .text("Откликнулся", `applied:${card.candidateId}:${card.jobId}`)
      .text("Закрыта", `closed:${card.candidateId}:${card.jobId}`);
    const message = await this.bot.api.sendMessage(destination, card.text, {
      reply_markup: keyboard,
    });
    return { externalId: String(message.message_id) };
  }
}
