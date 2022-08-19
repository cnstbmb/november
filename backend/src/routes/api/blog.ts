import express, { Request, Response } from 'express';
import { ApplicationRoutes } from '../types';
import cookieParser from 'cookie-parser';
import { WebTokenGuard } from '../web-token.guard';
import { ILogger } from '../../logger/types';
import { HttpStatusCode } from '../../types/http-status-code';
import { BlogController } from '../../controllers/blog/controller';

// type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export class Blog extends ApplicationRoutes {

    private readonly route: string = '/api/blog';

    constructor(
        logger: ILogger,
        application: express.Express,
        webTokenGuard: WebTokenGuard,
        private controller: BlogController
    ) {
        super(logger, application, webTokenGuard);
    }

    register(): void {
        this.logger.info(`Registering a blog route [${this.route}]`);
    
        this.application.use(cookieParser());
        this.application.route('/api/blog').post(this.webTokenGuard.protect(), this.createBlogPost.bind(this));
    }

    private async createBlogPost(req: Request, res: Response): Promise<void> {
        const {title, text, hashtags} = req.body;
        const {userId} = res.locals;
        this.logger.info({title, text, hashtags, userId});
        const blogPostId = await this.controller.savePost(userId, title, text, hashtags);
        res.status(HttpStatusCode.CREATED).json({id: blogPostId})
    }
}
