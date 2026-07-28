import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CollectorService } from './collector.service';
import { PrismaService } from './prisma.service';
import { QuotesController } from './quotes.controller';
import { QuoteSourcesService } from './quote-sources';
import { TickStore } from './tick-store';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [QuotesController],
  providers: [PrismaService, QuoteSourcesService, TickStore, CollectorService],
})
export class AppModule {}
