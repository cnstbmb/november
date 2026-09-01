import type { SourcePolicy } from "../config/config";

export function formatSourceSummary(policies: SourcePolicy[]): string {
  const manual = policies.find((policy) => policy.id === "manual");
  const chinaJob = policies.find((policy) => policy.id === "chinajob");
  const discovery = policies.find((policy) => policy.id === "discovery-only");
  const brave = policies.find((policy) => policy.id === "brave-discovery");
  const lever = policies.find((policy) => policy.id === "lever");
  const greenhouse = policies.find((policy) => policy.id === "greenhouse");
  const ashby = policies.find((policy) => policy.id === "ashby");
  const smartRecruiters = policies.find(
    (policy) => policy.id === "smartrecruiters",
  );
  const liveDiscoveryEnabled = policies.some(
    (policy) =>
      policy.enabled &&
      policy.live.enabled &&
      policy.allowedModes.some((mode) =>
        ["public_http", "search_discovery", "email", "browser"].includes(mode),
      ),
  );

  return [
    "Источники вакансий",
    `Автопоиск: ${liveDiscoveryEnabled ? "включён" : "выключен"}`,
    `Brave Search: ${brave?.enabled && brave.live.enabled ? "включён" : "выключен"}`,
    `Lever/Greenhouse: ${lever?.enabled && lever.live.enabled && greenhouse?.enabled && greenhouse.live.enabled ? "включены" : "выключены"}`,
    `Ashby/SmartRecruiters: ${ashby?.enabled && ashby.live.enabled && smartRecruiters?.enabled && smartRecruiters.live.enabled ? "включены" : "выключены"}`,
    `Manual input: ${manual?.enabled && manual.allowedModes.includes("manual_text") ? "приём текста включён" : "выключен"}`,
    `ChinaJob: ${chinaJob?.fixture.enabled && !chinaJob.live.enabled ? "только тестовые fixtures" : chinaJob?.live.enabled ? "live включён" : "выключен"}`,
    `Zhipin/Liepin/51job и другие: ${discovery?.live.enabled ? "live включён" : "live выключен"}`,
    "Команда /addtext анализирует присланное объявление, но не выполняет поиск.",
  ].join("\n");
}
