import { afterEach, describe, expect, test } from "vitest";
import { type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  MetricsController,
  RadarMetrics,
} from "../../src/observability/radar-metrics";
import {
  DiscoveryAutomation,
  type DiscoveryTimer,
} from "../../src/discovery/discovery-automation";

@Module({ controllers: [MetricsController], providers: [RadarMetrics] })
class MetricsTestModule {}

describe("Prometheus metrics endpoint", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  test("exposes the radar process as Prometheus text on the internal endpoint", async () => {
    app = await NestFactory.create(MetricsTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");

    const response = await fetch(`${await app.getUrl()}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain(
      "china_career_radar_build_info 1",
    );
  });

  test("shows whether scheduled discovery runs and exposes the completed funnel", async () => {
    let releaseRun: (() => void) | undefined;
    const executor = {
      run: () =>
        new Promise<any>((resolve) => {
          releaseRun = () =>
            resolve({
              tracks: ["software", "education"],
              candidateIds: ["cnstbmb", "lanok"],
              queriesAttempted: 4,
              failedQueries: 0,
              discoveredLeads: 28,
              uniqueLeads: 27,
              fetchedJobs: 16,
              failedFetches: 11,
              processedJobs: 16,
              newVersions: 2,
              analyses: 3,
              failedAnalyses: 0,
              notifications: 1,
              failedNotifications: 0,
            });
        }),
    };
    let scheduledTask: (() => Promise<void>) | undefined;
    const timer: DiscoveryTimer = {
      every(_intervalMs, task) {
        scheduledTask = task;
        return { cancel() {} };
      },
    };
    const metrics = new RadarMetrics();
    const automation = new DiscoveryAutomation(
      {
        enabled: true,
        runOnStartup: false,
        intervalMinutes: 360,
        apiKeyPresent: true,
      },
      executor,
      timer,
      metrics,
    );

    automation.onModuleInit();
    expect(metrics.render()).toMatch(
      /china_career_radar_discovery_next_scheduled_timestamp_seconds \d+/,
    );
    const running = scheduledTask!();
    await Promise.resolve();
    expect(metrics.render()).toContain(
      "china_career_radar_discovery_running 1",
    );

    releaseRun!();
    await running;
    const output = metrics.render();
    expect(output).toContain("china_career_radar_discovery_running 0");
    expect(output).toContain(
      'china_career_radar_discovery_runs_total{trigger="schedule",status="success"} 1',
    );
    expect(output).toContain(
      'china_career_radar_discovery_last_run_items{stage="discovered_leads"} 28',
    );
    expect(output).toContain(
      'china_career_radar_discovery_last_run_items{stage="notifications"} 1',
    );
    expect(output).toMatch(
      /china_career_radar_discovery_last_success_timestamp_seconds \d+/,
    );
  });
});
