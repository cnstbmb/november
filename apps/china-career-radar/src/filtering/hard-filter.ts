import type {
  CandidateProfile,
  HardFilterReason,
  HardFilterResult,
  NormalizedJob,
} from "../domain";

const contains = (job: NormalizedJob, pattern: RegExp) =>
  pattern.test(`${job.title} ${job.description}`);

export function hardFilter(
  job: NormalizedJob,
  profile: CandidateProfile,
): HardFilterResult {
  const reasons: HardFilterReason[] = [];
  const reject = (code: string, message: string, evidence?: string) =>
    reasons.push({ code, message, evidence });
  if (
    job.description.length < 20 ||
    /captcha|access denied|404 not found|页面不存在/i.test(job.description)
  )
    reject("invalid_content", "Страница не содержит валидную вакансию");
  if (job.country !== "China")
    reject(
      "outside_primary_market",
      "Вакансия не подтверждена как Mainland China",
    );
  if (
    job.employmentType === "internship" &&
    profile.definition["internshipsAllowed"] !== true
  )
    reject("internship_disallowed", "Стажировки не входят в профиль");
  if (contains(job, /(?:PRC|Chinese) citizens? only|仅限中国公民|中国籍/i))
    reject("citizenship_conflict", "Есть ограничение только для граждан КНР");
  if (
    contains(
      job,
      /must already have.*work authorization|no\s+(?:visa|sponsorship)|不提供.*签证/i,
    )
  )
    reject(
      "work_permit_unsupported",
      "Работодатель прямо не поддерживает законное оформление",
    );
  if (profile.id === "cnstbmb") {
    if (!job.candidateTracks.includes("software_engineering"))
      reject("role_mismatch", "Позиция не относится к IT-профилю");
    if (
      contains(
        job,
        /native|fluent|business[- ]level.{0,20}(?:mandarin|chinese)|母语.{0,10}中文|中文.{0,10}(?:流利|母语)/i,
      ) &&
      !contains(job, /english working|working language.{0,10}english/i)
    )
      reject(
        "mandarin_required",
        "Обязателен свободный китайский без альтернативы",
      );
  }
  if (profile.id === "lanok") {
    const relevant = job.candidateTracks.some((track) =>
      [
        "russian_education",
        "primary_education",
        "english_teaching_watch",
        "administrative_support",
      ].includes(track),
    );
    if (!relevant)
      reject(
        "role_mismatch",
        "Позиция не относится к образовательному или административному профилю",
      );
    if (
      contains(
        job,
        /native english speaker.*(?:passport|citizen)|passport holder.*(?:US|UK|Canada|Australia|New Zealand)|母语英语国家/i,
      )
    )
      reject(
        "native_passport_conflict",
        "Требование гражданства англоязычной страны несовместимо с профилем",
      );
    if (
      job.candidateTracks.includes("administrative_support") &&
      contains(
        job,
        /native|fluent.{0,20}(?:mandarin|chinese)|中文.{0,10}(?:流利|母语)/i,
      ) &&
      !contains(job, /english|russian|俄语|英语/i)
    )
      reject(
        "mandarin_required",
        "Для административной роли обязателен свободный китайский",
      );
  }
  return {
    passed: reasons.length === 0,
    reasons,
    policyVersion: "hard-filters-v1",
  };
}
