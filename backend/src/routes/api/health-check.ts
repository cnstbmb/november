import { Request, Response } from 'express';
import { ApplicationRoutes } from '../types';
import { HttpStatusCode } from '../../types/http-status-code';

export class HealthCheck extends ApplicationRoutes {
    private readonly route = '/api/healthz';

    register() {
        this.logger.info(`Registering a route to check the health of the server [${this.route}]`);
        this.application.get(this.route, (_req: Request, res: Response) => {
            this.logger.info('Health check');
            res.status(HttpStatusCode.OK).json({ status: 'UP' });
        });
    }
}
