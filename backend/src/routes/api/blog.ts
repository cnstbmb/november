import express, { Request, Response } from 'express';
import { ApplicationRoutes } from '../types';
import cookieParser from 'cookie-parser';
import { WebTokenGuard } from '../web-token.guard';
import { ILogger } from '../../logger/types';
import { HttpStatusCode } from '../../types/http-status-code';
import { BlogController } from '../../controllers/blog/controller';

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
        this.application.route('/api/blog').get(this.getBlogPosts.bind(this));
        this.application.route('/api/blog').post(this.webTokenGuard.protect(), this.createBlogPost.bind(this));
        this.application.route('/api/blog/:id').delete(this.webTokenGuard.protect(), this.removeBlogPost.bind(this));
    }

    private async createBlogPost(req: Request, res: Response): Promise<void> {
        const {title, content, hashtags} = req.body;
        const {userId} = res.locals;
        const blogPostId = await this.controller.savePost(userId, title, content, hashtags);
        res.status(HttpStatusCode.CREATED).json({id: blogPostId})
    }
    
    private async getBlogPosts(req: Request, res: Response): Promise<void> {
        const {rows, first} = req.query;

        //TODO: парсер 
        let limit = undefined;
        if (typeof rows === 'string' || typeof rows === 'number') {
            limit = +rows;
        }

        let offset = undefined;
        if (typeof first === 'string' || typeof first === 'number') {
            offset = +first;
        }

        const posts = await this.controller.getPosts(limit, offset);
        res.status(HttpStatusCode.OK).json(posts);
    }

    private async removeBlogPost(req: Request, res: Response): Promise<void> {
        const {id} =  req.params;
        const removedPostId = await this.controller.deletePost(id);
        res.status(HttpStatusCode.OK).json({id: removedPostId});
    }
}
