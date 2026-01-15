import express, { Request, Response } from 'express';
import { ILogger } from '../../logger/types';
import { HttpStatusCode } from '../../types/http-status-code';
import { ApplicationRoutes } from '../types';
import { UsersController } from '../../controllers/users/controller';
import { WebTokenGuard } from '../web-token.guard';

export class Auth extends ApplicationRoutes {
    constructor(
        logger: ILogger,
        application: express.Express,
        webTokenGuard: WebTokenGuard,
        private readonly usersController: UsersController
    ) {
        super(logger, application, webTokenGuard);
    }

    register(): void {
        this.logger.info('Registering auth route');
        this.application.route('/api/login').post(this.loginRoute.bind(this));
        this.application.route('/api/unauth_test').get(this.webTokenGuard.protect(), this.test.bind(this));
    }

    private test(_req: Request, res: Response) {
        res.status(HttpStatusCode.I_AM_A_TEAPOT);
        res.send();
    }

    private async loginRoute(req: Request, res: Response) {
        const { login, password } = req.body;

        // FIXME: если БД недоступна, ответа от сервера не поступает на клиент.
        const isValidLoginPassword = await this.validateLoginAndPassword(login, password);
        if (!isValidLoginPassword) {
            this.logger.info(`invalid login|password for "${login}"`);
            res.sendStatus(HttpStatusCode.UNAUTHORIZED);
            return;
        }

        const userId = await this.findUserIdForLogin(login);

        if (!userId) {
            this.logger.info(`Can't find user by login: "${login}"`);
            res.sendStatus(HttpStatusCode.NOT_FOUND);
            return;
        }

        this.webTokenGuard.addJwtTokenCookie(res, login, { userId });
        this.logger.info('JWT Token done');
        res.status(HttpStatusCode.OK);
        res.send();
    }

    private async validateLoginAndPassword(login: string, password: string): Promise<boolean> {
        return this.usersController.isCorrectLoginPassword(login, password);
    }

    private async findUserIdForLogin(login: string): Promise<string | undefined> {
        const user = await this.usersController.getUserByLogin(login);
        if (!user) {
            this.logger.error(`Failed. User "${login}" not found`);
            return undefined;
        }

        this.logger.info(`User ${login} found`);
        return user.id;
    }
}
