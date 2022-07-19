import express, { Request, Response } from 'express';
import { ApplicationRoutes } from '../types';
import { ILogger } from '../../logger/types';

export class HealthCheck extends ApplicationRoutes {
    constructor(logger: ILogger, application: express.Express) {
        super(logger, application);
    }

    register() {
        this.logger.info('Registering a route to check the health of the server [/healthz]');
        this.application.get('/healthz', (_req: Request, res: Response) => {
            this.logger.info('Health check');
            res.send('Health check ok');
        });
    }
}
