import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { expressjwt/* , Request as JWTRequest */ } from 'express-jwt';
import { ILogger } from '../../logger/types';
import { HttpStatusCode } from '../../types/http-status-code';
import { ApplicationRoutes } from '../types';
import { UsersController } from '../../controllers/users/controller';
import { isProd } from '../../env';

type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export class Auth extends ApplicationRoutes {
    private readonly rsaPrivateKeyPath = path.join(__dirname, '..', '..', 'configs', 'auth.pem');

    private readonly rsaPublicKeyPath = path.join(__dirname, '..', '..', 'configs', 'auth-public.pem');

    private readonly rsaPrivateKey: Buffer;

    private readonly rsaPublicKey: Buffer;

    private readonly algorithm = 'RS512'// 'RS256'

    private readonly tokenLifetime = '24h';

    private readonly tokenLifeTimeMs = 24 * 60 * 60 * 1000;

    private readonly checkIfAuthenticated: AuthenticationMiddleware;

    constructor(
        logger: ILogger,
        application: express.Express,
        private readonly usersController: UsersController,
    ) {
        super(logger, application);

        this.rsaPrivateKey = fs.readFileSync(this.rsaPrivateKeyPath);
        this.rsaPublicKey = fs.readFileSync(this.rsaPublicKeyPath);
        this.checkIfAuthenticated = expressjwt(
            {
                secret: this.rsaPublicKey,
                algorithms: [this.algorithm],
                getToken: (req: Request) => {
                    const authHeader = req.headers.authorization;
                    return authHeader?.split(' ')[1];
                },
            },
        ).unless({ path: ['/api/login'] });
    }

    register(): void {
        this.logger.info('Registering auth route');
        this.application.use(cookieParser());
        this.application.route('/api/login').post(this.loginRoute.bind(this));
        this.application.route('/api/unauth_test').get(this.checkIfAuthenticated.bind(this), this.test.bind(this));
    }

    private test(_req: Request, res: Response) {
        res.status(HttpStatusCode.I_AM_A_TEAPOT);
        res.send();
    }

    private async loginRoute(req: Request, res: Response) {
        const { email, password } = req.body;

        // TODO: если БД недоступна, ответа от сервера не поступает на клиент.
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

        const jwtBearerToken = jwt.sign({}, this.rsaPrivateKey, {
            algorithm: this.algorithm,
            expiresIn: this.tokenLifetime,
            subject: userId,
        });

        this.addJwtTokenCookie(res, jwtBearerToken);
        // this.addJsonJwtToken(res, jwtBearerToken, this.tokenLifeTimeMs);
        // TODO - multiple options available
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
            return undefined;
        }

        this.logger.info(`User ${email} found`);
        return user.id;
    }

    private addJwtTokenCookie(res: Response, token: string): void {
        res.cookie('SESSIONID', token, {
            secure: isProd(), // true,
            maxAge: this.tokenLifeTimeMs,
        });
    }

    // private addJsonJwtToken(res: Response, token: string, expiresIn: number): void {
    //     res.json({
    //         idToken: token,
    //         expiresIn,
    //     });
    // }
    // checkAuthenticatedByCookies(req: Request, res: Response, next: NextFunction) {
    //     const authHeader = req.headers.authorization;
    //     const token = authHeader?.split(' ')[1];
    //
    //     if (token == null) return res.sendStatus(401);
    //
    //     jwt.verify(token, this.rsaPublicKey, (err, user) => {
    //         if (err) {
    //             return res.sendStatus(403);
    //         }
    //
    //         req.user = user;
    //         next();
    //
    //         return null;
    //     });
    // }
}
