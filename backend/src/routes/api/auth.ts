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
        private readonly usersController: UsersController,
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
        const { email, password } = req.body;

        //FIXME: если БД недоступна, ответа от сервера не поступает на клиент.
        const isValidEmailPassword = await this.validateEmailAndPassword(email, password);
        if (!isValidEmailPassword) {
            this.logger.info(`invalid email|password for "${email}"`);
            res.sendStatus(HttpStatusCode.UNAUTHORIZED);
            return;
        }

        const userId = await this.findUserIdForEmail(email);

        if (!userId) {
            this.logger.info(`Can't find user by email: "${email}"`);
            res.sendStatus(HttpStatusCode.NOT_FOUND);
            return;
        }

        this.webTokenGuard.addJwtTokenCookie(res, userId, {userId})
        this.logger.info('JWT Token done');
        res.status(HttpStatusCode.OK);
        res.send();
    }

    private async validateEmailAndPassword(login: string, password: string): Promise<boolean> {
        return this.usersController.isCorrectLoginPassword(login, password);
    }

    private async findUserIdForEmail(email: string): Promise<string | undefined> {
        const user = await this.usersController.getUserByLogin(email);
        if (!user) {
            this.logger.error(`Failed. User "${email}" not found`);
            return;
        }

        this.logger.info(`User ${email} found`);
        return user.id;
    }
}
