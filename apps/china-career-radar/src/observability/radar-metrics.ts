import { Controller, Get, Header, Injectable } from "@nestjs/common";
import type { DiscoveryRunSummary } from "../discovery/discovery.service";

const PROMETHEUS_CONTENT_TYPE =
  "text/plain; version=0.0.4; charset=utf-8";

@Injectable()
export class RadarMetrics {
  private readonly processStartedAt = Date.now() / 1000;
  private discoveryEnabled = 0;
  private discoveryIntervalMinutes = 0;
  private discoveryRunning = 0;
  private nextDiscoveryScheduledAt = 0;
  private lastDiscoveryStartedAt = 0;
  private lastDiscoveryFinishedAt = 0;
  private lastDiscoverySuccessAt = 0;
  private lastDiscoverySummary?: DiscoveryRunSummary;
  private readonly discoveryRuns = new Map<string, number>();
  private readonly analyses = new Map<string, number>();
  private readonly notifications = new Map<string, number>();
  private readonly hardFilterRejections = new Map<string, number>();

  configureDiscovery(enabled: boolean, intervalMinutes: number): void {
    this.discoveryEnabled = enabled ? 1 : 0;
    this.discoveryIntervalMinutes = intervalMinutes;
    this.nextDiscoveryScheduledAt = enabled
      ? Date.now() / 1000 + intervalMinutes * 60
      : 0;
  }

  discoveryStarted(trigger: "startup" | "schedule" | "manual"): void {
    this.discoveryRunning = 1;
    this.lastDiscoveryStartedAt = Date.now() / 1000;
    if (trigger === "schedule")
      this.nextDiscoveryScheduledAt += this.discoveryIntervalMinutes * 60;
  }

  discoveryCompleted(
    trigger: "startup" | "schedule" | "manual",
    summary: DiscoveryRunSummary,
  ): void {
    this.discoveryRunning = 0;
    this.lastDiscoveryFinishedAt = Date.now() / 1000;
    this.lastDiscoverySuccessAt = this.lastDiscoveryFinishedAt;
    this.lastDiscoverySummary = summary;
    this.incrementRun(trigger, "success");
  }

  discoveryFailed(trigger: "startup" | "schedule" | "manual"): void {
    this.discoveryRunning = 0;
    this.lastDiscoveryFinishedAt = Date.now() / 1000;
    this.incrementRun(trigger, "failure");
  }

  analysisCompleted(candidateId: string, verdict: string): void {
    this.increment(this.analyses, `${candidateId}:${verdict}:success`);
  }

  analysisFailed(candidateId: string): void {
    this.increment(this.analyses, `${candidateId}:unknown:failure`);
  }

  notificationSent(candidateId: string): void {
    this.increment(this.notifications, `${candidateId}:sent`);
  }

  notificationFailed(candidateId: string): void {
    this.increment(this.notifications, `${candidateId}:failed`);
  }

  hardFilterRejected(candidateId: string, reason: string): void {
    this.increment(this.hardFilterRejections, `${candidateId}:${reason}`);
  }

  private increment(target: Map<string, number>, key: string): void {
    target.set(key, (target.get(key) ?? 0) + 1);
  }

  private incrementRun(trigger: string, status: string): void {
    const key = `${trigger}:${status}`;
    this.discoveryRuns.set(key, (this.discoveryRuns.get(key) ?? 0) + 1);
  }

  render(): string {
    const lines = [
      "# HELP china_career_radar_build_info China Career Radar process information.",
      "# TYPE china_career_radar_build_info gauge",
      "china_career_radar_build_info 1",
      "# HELP china_career_radar_process_start_timestamp_seconds Process start time as a Unix timestamp.",
      "# TYPE china_career_radar_process_start_timestamp_seconds gauge",
      `china_career_radar_process_start_timestamp_seconds ${this.processStartedAt}`,
      "# HELP china_career_radar_discovery_enabled Whether automatic discovery is enabled.",
      "# TYPE china_career_radar_discovery_enabled gauge",
      `china_career_radar_discovery_enabled ${this.discoveryEnabled}`,
      "# HELP china_career_radar_discovery_interval_minutes Configured discovery interval.",
      "# TYPE china_career_radar_discovery_interval_minutes gauge",
      `china_career_radar_discovery_interval_minutes ${this.discoveryIntervalMinutes}`,
      "# HELP china_career_radar_discovery_running Whether a discovery run is active.",
      "# TYPE china_career_radar_discovery_running gauge",
      `china_career_radar_discovery_running ${this.discoveryRunning}`,
      "# HELP china_career_radar_discovery_next_scheduled_timestamp_seconds Next automatic discovery time as a Unix timestamp.",
      "# TYPE china_career_radar_discovery_next_scheduled_timestamp_seconds gauge",
      `china_career_radar_discovery_next_scheduled_timestamp_seconds ${this.nextDiscoveryScheduledAt}`,
      "# HELP china_career_radar_discovery_last_started_timestamp_seconds Last discovery start time as a Unix timestamp.",
      "# TYPE china_career_radar_discovery_last_started_timestamp_seconds gauge",
      `china_career_radar_discovery_last_started_timestamp_seconds ${this.lastDiscoveryStartedAt}`,
      "# HELP china_career_radar_discovery_last_finished_timestamp_seconds Last discovery finish time as a Unix timestamp.",
      "# TYPE china_career_radar_discovery_last_finished_timestamp_seconds gauge",
      `china_career_radar_discovery_last_finished_timestamp_seconds ${this.lastDiscoveryFinishedAt}`,
      "# HELP china_career_radar_discovery_last_success_timestamp_seconds Last successful discovery time as a Unix timestamp.",
      "# TYPE china_career_radar_discovery_last_success_timestamp_seconds gauge",
      `china_career_radar_discovery_last_success_timestamp_seconds ${this.lastDiscoverySuccessAt}`,
      "# HELP china_career_radar_discovery_runs_total Discovery runs completed by trigger and status.",
      "# TYPE china_career_radar_discovery_runs_total counter",
    ];
    for (const [key, value] of this.discoveryRuns) {
      const [trigger, status] = key.split(":");
      lines.push(
        `china_career_radar_discovery_runs_total{trigger="${trigger}",status="${status}"} ${value}`,
      );
    }
    lines.push(
      "# HELP china_career_radar_discovery_last_run_items Items observed at each stage of the last successful discovery run.",
      "# TYPE china_career_radar_discovery_last_run_items gauge",
    );
    if (this.lastDiscoverySummary) {
      const stages: Array<[string, number]> = [
        ["queries_attempted", this.lastDiscoverySummary.queriesAttempted],
        ["failed_queries", this.lastDiscoverySummary.failedQueries],
        ["discovered_leads", this.lastDiscoverySummary.discoveredLeads],
        ["unique_leads", this.lastDiscoverySummary.uniqueLeads],
        ["fetched_jobs", this.lastDiscoverySummary.fetchedJobs],
        ["failed_fetches", this.lastDiscoverySummary.failedFetches],
        ["processed_jobs", this.lastDiscoverySummary.processedJobs],
        ["new_versions", this.lastDiscoverySummary.newVersions],
        ["analyses", this.lastDiscoverySummary.analyses],
        ["failed_analyses", this.lastDiscoverySummary.failedAnalyses],
        ["notifications", this.lastDiscoverySummary.notifications],
        [
          "failed_notifications",
          this.lastDiscoverySummary.failedNotifications,
        ],
      ];
      for (const [stage, value] of stages)
        lines.push(
          `china_career_radar_discovery_last_run_items{stage="${stage}"} ${value}`,
        );
    }
    lines.push(
      "# HELP china_career_radar_analyses_total Vacancy analyses by candidate, verdict and outcome.",
      "# TYPE china_career_radar_analyses_total counter",
    );
    for (const [key, value] of this.analyses) {
      const [candidate, verdict, status] = key.split(":");
      lines.push(
        `china_career_radar_analyses_total{candidate="${candidate}",verdict="${verdict}",status="${status}"} ${value}`,
      );
    }
    lines.push(
      "# HELP china_career_radar_notifications_total Vacancy notifications by candidate and outcome.",
      "# TYPE china_career_radar_notifications_total counter",
    );
    for (const [key, value] of this.notifications) {
      const [candidate, status] = key.split(":");
      lines.push(
        `china_career_radar_notifications_total{candidate="${candidate}",status="${status}"} ${value}`,
      );
    }
    lines.push(
      "# HELP china_career_radar_hard_filter_rejections_total Hard filter rejections by candidate and reason.",
      "# TYPE china_career_radar_hard_filter_rejections_total counter",
    );
    for (const [key, value] of this.hardFilterRejections) {
      const separator = key.indexOf(":");
      const candidate = key.slice(0, separator);
      const reason = key.slice(separator + 1);
      lines.push(
        `china_career_radar_hard_filter_rejections_total{candidate="${candidate}",reason="${reason}"} ${value}`,
      );
    }
    lines.push("");
    return lines.join("\n");
  }
}

@Controller()
export class MetricsController {
  constructor(private readonly metrics: RadarMetrics) {}

  @Get("metrics")
  @Header("Content-Type", PROMETHEUS_CONTENT_TYPE)
  metricsText(): string {
    return this.metrics.render();
  }
}
