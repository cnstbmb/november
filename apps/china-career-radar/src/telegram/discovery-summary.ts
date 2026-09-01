import type { DiscoveryRunSummary } from "../discovery/discovery.service";

export function formatDiscoveryRunSummary(
  summary: DiscoveryRunSummary,
): string {
  return [
    `Поиск завершён для ${summary.candidateIds.join(" и ")}.`,
    `Запросы: ${summary.queriesAttempted} (ошибок: ${summary.failedQueries})`,
    `Найдено ссылок: ${summary.discoveredLeads}, уникальных: ${summary.uniqueLeads}`,
    `Загружено вакансий: ${summary.fetchedJobs} (ошибок: ${summary.failedFetches})`,
    `Новых/обновлённых: ${summary.newVersions}, анализов: ${summary.analyses} (ошибок: ${summary.failedAnalyses})`,
    `Отправлено в Telegram: ${summary.notifications} (ошибок: ${summary.failedNotifications})`,
  ].join("\n");
}
