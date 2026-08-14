import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CollectorService } from './collector.service';
import { PrismaService } from './prisma.service';
import { QuotesController } from './quotes.controller';
import { QuoteSourcesService } from './quote-sources';
import { TickStore } from './tick-store';
import { HealthController } from './observability/health.controller';
import { HealthService } from './observability/health.service';
import { MetricsController } from './observability/metrics.controller';
import { MetricsService } from './observability/metrics.service';
import { RequestObservabilityMiddleware } from './observability/request-observability.middleware';
import { ClientTelemetryController } from './observability/client-telemetry.controller';
import { AnalyticsIngestController } from './observability/analytics-ingest.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    QuotesController,
    HealthController,
    MetricsController,
    ClientTelemetryController,
    AnalyticsIngestController,
  ],
  providers: [PrismaService, QuoteSourcesService, TickStore, CollectorService, HealthService, MetricsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestObservabilityMiddleware).forRoutes('*');
  }
}
