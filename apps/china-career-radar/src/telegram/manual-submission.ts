export type ManualSubmissionDecision =
  { kind: "vacancy" } | { kind: "search_brief"; message: string };

export function assessManualSubmission(text: string): ManualSubmissionDecision {
  const searchBriefMarkers = [
    /\bpriority locations?\b/i,
    /\btarget salary\b/i,
    /\bdo not reject vacancies\b/i,
    /\bprioriti[sz]e\b.+\bcompan(?:y|ies)\b/i,
    /\bexclude\b.+\b(?:positions|vacancies|internships)\b/i,
    /\b(?:also )?consider\b.+\b(?:beijing|shenzhen|hangzhou|suzhou|guangzhou|nanjing|chengdu)\b/i,
    /приоритетн\w*\s+(?:город|локац)/iu,
    /целев\w*\s+зарплат/iu,
    /не\s+отсека/iu,
    /ищ(?:и|ем|у)\s+ваканси/iu,
    /исключ(?:и|аем|ить).+(?:ваканси|позици|стажиров)/iu,
  ];
  const markerCount = searchBriefMarkers.filter((marker) =>
    marker.test(text),
  ).length;

  if (markerCount >= 2)
    return {
      kind: "search_brief",
      message:
        "Похоже, это критерии поиска, а не текст конкретной вакансии. /addtext не запускает поиск: пришлите полное объявление с названием, компанией, обязанностями и требованиями. Статус подключённых источников: /sources.",
    };
  return { kind: "vacancy" };
}
