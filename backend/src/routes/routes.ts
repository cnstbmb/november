import express from 'express';
import { ApplicationRoutes } from './types';
import { HealthCheck } from './healthz/health-check';
import { Auth } from './api/auth';
import { ILogger } from '../logger/types';
import { Frontend } from './static/frontend';

export class Routes extends ApplicationRoutes {
    readonly healthCheck: HealthCheck;

    readonly auth: Auth;

    readonly frontend: Frontend;

    constructor(logger: ILogger, application: express.Express) {
        super(logger, application);

        this.healthCheck = new HealthCheck(logger, application);
        this.auth = new Auth(logger, application);
        this.frontend = new Frontend(logger, application);
    }

    register(): void {
        this.healthCheck.register();
        this.auth.register();
        this.frontend.register();
    }
}
