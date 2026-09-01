import { Module } from "@nestjs/common";
import { DeepSeekJobAnalyzer, MockJobAnalyzer } from "./analysis/analyzers";
import { RadarConfig } from "./config/config";
import { DatabaseService } from "./database/database";
import { DiscoveryAutomation } from "./discovery/discovery-automation";
import { BraveSearchProvider } from "./discovery/brave-search.provider";
import { DiscoveryService } from "./discovery/discovery.service";
import {
  createAtsHttpClient,
  PublicAtsJobProvider,
} from "./discovery/public-ats-job.provider";
import { HealthController } from "./health/health.controller";
import {
  IngestionPipeline,
  JOB_ANALYZER,
  NOTIFIER,
} from "./ingestion/pipeline";
import { InternalController } from "./internal.controller";
import { ConsoleNotifier, TelegramNotifier } from "./notifications/notifiers";
import { MetricsController, RadarMetrics } from "./observability/radar-metrics";
import { QueueService } from "./scheduler/queue.service";
import { ManualUrlService } from "./sources/manual-url.service";
import { TelegramService } from "./telegram/telegram.service";

@Module({
  controllers: [HealthController, InternalController, MetricsController],
  providers: [
    { provide: RadarConfig, useFactory: () => new RadarConfig() },
    DatabaseService,
    RadarMetrics,
    {
      provide: JOB_ANALYZER,
      inject: [RadarConfig],
      useFactory: (config: RadarConfig) =>
        config.env.ANALYZER_PROVIDER === "deepseek"
          ? new DeepSeekJobAnalyzer(config)
          : new MockJobAnalyzer(),
    },
    {
      provide: NOTIFIER,
      inject: [RadarConfig],
      useFactory: (config: RadarConfig) =>
        config.env.TELEGRAM_BOT_TOKEN
          ? new TelegramNotifier(
              config.env.TELEGRAM_BOT_TOKEN,
              config.env.TELEGRAM_PROXY_URL,
            )
          : new ConsoleNotifier(),
    },
    IngestionPipeline,
    {
      provide: DiscoveryService,
      inject: [RadarConfig, IngestionPipeline],
      useFactory: (config: RadarConfig, pipeline: IngestionPipeline) =>
        new DiscoveryService(
          new BraveSearchProvider(config.env.BRAVE_SEARCH_API_KEY),
          new PublicAtsJobProvider(
            createAtsHttpClient(config.env.ATS_PROXY_URL),
          ),
          pipeline,
          config.searchPlans,
        ),
    },
    {
      provide: DiscoveryAutomation,
      inject: [RadarConfig, DiscoveryService, RadarMetrics],
      useFactory: (
        config: RadarConfig,
        discovery: DiscoveryService,
        metrics: RadarMetrics,
      ) => {
        const approved = [
          "brave-discovery",
          "lever",
          "greenhouse",
          "ashby",
          "smartrecruiters",
        ].every((id) => {
          const policy = config.sourcePolicies.find(
            (candidate) => candidate.id === id,
          );
          return (
            policy?.enabled &&
            policy.policyStatus === "approved" &&
            policy.live.enabled
          );
        });
        return new DiscoveryAutomation(
          {
            enabled: config.env.DISCOVERY_ENABLED && approved,
            runOnStartup: config.env.DISCOVERY_RUN_ON_STARTUP,
            intervalMinutes: config.env.DISCOVERY_INTERVAL_MINUTES,
            apiKeyPresent: Boolean(config.env.BRAVE_SEARCH_API_KEY),
          },
          discovery,
          undefined,
          metrics,
        );
      },
    },
    ManualUrlService,
    QueueService,
    TelegramService,
  ],
  exports: [IngestionPipeline, DatabaseService, RadarConfig],
})
export class AppModule {}
