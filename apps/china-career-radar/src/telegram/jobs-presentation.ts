export interface JobsPageFilterReason {
  code: string;
  message: string;
}

export interface JobsPageAssessment {
  candidateId: string;
  state: "completed" | "filtered" | "pending" | "failed" | "not_evaluated";
  score?: number | null;
  verdict?: string | null;
  reasons?: JobsPageFilterReason[];
  failureCategory?: string | null;
}

export interface JobsPageItem {
  id: string;
  firstSeenAt: Date;
  title: string;
  company: string;
  city: string;
  sourceId: string;
  status: string;
  canonicalUrl: string | null;
  assessments: JobsPageAssessment[];
}

export interface JobsPage {
  items: JobsPageItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface InlineButton {
  text: string;
  callback_data: string;
}

export interface JobsPageReplyMarkup {
  inline_keyboard: InlineButton[][];
}

const sourceLabels: Record<string, string> = {
  manual: "добавлено вручную",
};

const statusLabels: Record<string, string> = {
  open: "открыта",
  active: "открыта",
  closed: "закрыта",
};

const filterReasonLabels: Record<string, string> = {
  invalid_content: "некорректное объявление",
  outside_primary_market: "не Mainland China",
  internship_disallowed: "стажировка",
  citizenship_conflict: "только граждане КНР",
  work_permit_unsupported: "нет поддержки Work Permit",
  role_mismatch: "не подходит направление",
  mandarin_required: "требуется свободный китайский",
  native_passport_conflict: "нужен паспорт англоязычной страны",
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(value);
}

function formatAssessment(assessment: JobsPageAssessment): string {
  if (assessment.state === "completed")
    return `${assessment.candidateId}: ✅ AI ${assessment.score ?? "—"}/${assessment.verdict ?? "—"}`;
  if (assessment.state === "filtered") {
    const reasons = assessment.reasons?.length
      ? assessment.reasons
          .map(
            (reason) =>
              filterReasonLabels[reason.code] ?? reason.message.slice(0, 100),
          )
          .join("; ")
      : "не прошла предварительный фильтр";
    return `${assessment.candidateId}: ⛔ до AI — ${reasons}`;
  }
  if (assessment.state === "pending")
    return `${assessment.candidateId}: ⏳ AI выполняется`;
  if (assessment.state === "failed")
    return `${assessment.candidateId}: ⚠️ ошибка AI — ${assessment.failureCategory ?? "причина не указана"}`;
  return `${assessment.candidateId}: ◻️ ещё не обработана`;
}

export function formatJobsPage(page: JobsPage): string {
  if (page.total === 0) return "Распарсенных вакансий пока нет";
  const first = page.page * page.pageSize + 1;
  const last = first + page.items.length - 1;
  const header = `Вакансии: ${first}–${last} из ${page.total}`;
  const items = page.items.map((job, index) => {
    return [
      `${first + index}. ${formatDate(job.firstSeenAt)} · ${job.title} — ${job.company}, ${job.city}`,
      `Источник: ${sourceLabels[job.sourceId] ?? job.sourceId} · Статус: ${statusLabels[job.status] ?? job.status}`,
      ...job.assessments.map(formatAssessment),
      job.canonicalUrl ?? `ID: ${job.id}`,
    ].join("\n");
  });
  return [header, ...items].join("\n\n");
}

export function jobsPageKeyboard(
  page: JobsPage,
): JobsPageReplyMarkup | undefined {
  const buttons: InlineButton[] = [];
  if (page.page > 0)
    buttons.push({ text: "← Новее", callback_data: `jobs:${page.page - 1}` });
  if ((page.page + 1) * page.pageSize < page.total)
    buttons.push({ text: "Старее →", callback_data: `jobs:${page.page + 1}` });
  return buttons.length ? { inline_keyboard: [buttons] } : undefined;
}

export function parseJobsPageCallback(value: string): number | undefined {
  const match = /^jobs:(\d{1,4})$/.exec(value);
  if (!match) return undefined;
  return Number(match[1]);
}
