import type { OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import type { DiscoveryRunSummary } from "./discovery.service";
import { RadarMetrics } from "../observability/radar-metrics";

export interface DiscoveryAutomationConfig {
  enabled: boolean;
  runOnStartup: boolean;
  intervalMinutes: number;
  apiKeyPresent: boolean;
}

export interface DiscoveryRunExecutor {
  run(): Promise<DiscoveryRunSummary>;
}

export interface DiscoveryTimerHandle {
  cancel(): void;
}

export interface DiscoveryTimer {
  every(intervalMs: number, task: () => Promise<void>): DiscoveryTimerHandle;
}

const systemTimer: DiscoveryTimer = {
  every(intervalMs, task) {
    const handle = setInterval(() => void task(), intervalMs);
    handle.unref();
    return { cancel: () => clearInterval(handle) };
  },
};

export interface DiscoveryAutomationStatus {
  enabled: boolean;
  running: boolean;
  intervalMinutes: number;
  lastTrigger?: "startup" | "schedule" | "manual";
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastSummary?: DiscoveryRunSummary;
  lastError?: string;
}

export class DiscoveryAutomation
  implements OnModuleInit, OnApplicationShutdown
{
  private timerHandle?: DiscoveryTimerHandle;
  private active?: Promise<DiscoveryRunSummary>;
  private readonly state: DiscoveryAutomationStatus;

  constructor(
    private readonly config: DiscoveryAutomationConfig,
    private readonly executor: DiscoveryRunExecutor,
    private readonly timer: DiscoveryTimer = systemTimer,
    private readonly metrics: RadarMetrics = new RadarMetrics(),
  ) {
    this.state = {
      enabled: config.enabled && config.apiKeyPresent,
      running: false,
      intervalMinutes: config.intervalMinutes,
    };
  }

  onModuleInit(): void {
    this.metrics.configureDiscovery(
      this.state.enabled,
      this.config.intervalMinutes,
    );
    if (!this.state.enabled) return;
    this.timerHandle = this.timer.every(
      this.config.intervalMinutes * 60_000,
      async () => {
        await this.runNow("schedule");
      },
    );
    if (this.config.runOnStartup)
      void this.runNow("startup").catch(() => undefined);
  }

  runNow(
    trigger: "startup" | "schedule" | "manual" = "manual",
  ): Promise<DiscoveryRunSummary> {
    if (!this.state.enabled)
      return Promise.reject(new Error("automatic_discovery_disabled"));
    if (this.active) return this.active;
    this.state.running = true;
    this.state.lastTrigger = trigger;
    this.state.lastStartedAt = new Date().toISOString();
    this.state.lastError = undefined;
    this.metrics.discoveryStarted(trigger);
    const active = this.executor
      .run()
      .then((summary) => {
        this.state.lastSummary = summary;
        process.stdout.write(
          `${JSON.stringify({ level: "info", event: "discovery.completed", trigger, ...summary })}\n`,
        );
        this.metrics.discoveryCompleted(trigger, summary);
        return summary;
      })
      .catch((error: unknown) => {
        this.state.lastError =
          error instanceof Error ? error.message.slice(0, 200) : "unknown";
        process.stderr.write(
          `${JSON.stringify({ level: "error", event: "discovery.failed", trigger, message: this.state.lastError })}\n`,
        );
        this.metrics.discoveryFailed(trigger);
        throw error;
      })
      .finally(() => {
        this.state.running = false;
        this.state.lastFinishedAt = new Date().toISOString();
        this.active = undefined;
      });
    this.active = active;
    return active;
  }

  status(): DiscoveryAutomationStatus {
    return { ...this.state };
  }

  onApplicationShutdown(): void {
    this.timerHandle?.cancel();
  }
}
