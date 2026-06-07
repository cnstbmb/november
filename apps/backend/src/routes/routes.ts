import express, {
    NextFunction, Request, Response, Errback
} from 'express';
import { UnauthorizedError } from 'express-jwt';
import cookieParser from 'cookie-parser';
import { ApplicationRoutes } from './types';
import { HealthCheck } from './api/health-check';
import { Auth } from './api/auth';
import { ILogger } from '../logger/types';
import { UsersController } from '../controllers/users/controller';
import { WebTokenGuard } from './web-token.guard';
import { HttpStatusCode } from '../types/http-status-code';
import { Blog } from './api/blog';
import { BlogController } from '../controllers/blog/controller';

export class Routes extends ApplicationRoutes {
    readonly healthCheck: HealthCheck;

    readonly auth: Auth;

    readonly blog: Blog;

    constructor(
        logger: ILogger,
        application: express.Express,
        webTokenGuard: WebTokenGuard,
        usersController: UsersController,
        blogController: BlogController
    ) {
        super(logger, application, webTokenGuard);

        this.healthCheck = new HealthCheck(logger, application, webTokenGuard);
        this.auth = new Auth(logger, application, webTokenGuard, usersController);
        this.blog = new Blog(logger, application, webTokenGuard, blogController);
    }

    register(): void {
        this.application.use(cookieParser());
        this.detectUserMiddleWare();

        this.healthCheck.register();
        this.auth.register();
        this.blog.register();

        this.unauthErrorHandler();
    }

    private unauthErrorHandler(): void {
        this.application.use(
            (err: Errback, _req: Request, res: Response, next: NextFunction) => {
                if (err.name === UnauthorizedError.name) {
                    res.sendStatus(HttpStatusCode.UNAUTHORIZED);
                    return;
                }
                next(err);
            }
        );
    }

    private detectUserMiddleWare(): void {
        this.application.use((req: Request, res: Response, next: NextFunction) => {
            const sessionId = req?.cookies?.SESSIONID;
            const decoded = this.webTokenGuard.decodeSessionId(sessionId);
            res.locals.userId = decoded?.userId || 'anonymous';
            next();
        });
    }
}
