import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<{ status: 'ok' | 'unhealthy' }> {
    const ready = await this.health.isReady();
    if (!ready) response.status(503);
    return { status: ready ? 'ok' : 'unhealthy' };
  }

  @Get('health')
  healthSnapshot(@Res({ passthrough: true }) response: Response) {
    const snapshot = this.health.snapshot();
    if (snapshot.status !== 'ok') response.status(503);
    return snapshot;
  }
}
