import express from 'express';
import { ApplicationRoutes } from './types';
import { HealthCheck } from './healthz/health-check';
import { Auth } from './api/auth';
import { ILogger } from '../logger/types';
import { Frontend } from './static/frontend';
import { UsersController } from '../controllers/users/controller';

export class Routes extends ApplicationRoutes {
    readonly healthCheck: HealthCheck;

    readonly auth: Auth;

    readonly frontend: Frontend;

    constructor(
        logger: ILogger,
        application: express.Express,
        usersController: UsersController,
    ) {
        super(logger, application);

        this.healthCheck = new HealthCheck(logger, application);
        this.auth = new Auth(logger, application, usersController);
        this.frontend = new Frontend(logger, application);
    }

    register(): void {
        this.healthCheck.register();
        this.auth.register();
        this.frontend.register();
    }
}
