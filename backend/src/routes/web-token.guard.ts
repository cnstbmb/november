import path from 'path';
import fs from 'fs';
import express, {
    NextFunction, Request, Response, Errback
} from 'express';
import * as jwt from 'jsonwebtoken';
import { expressjwt, UnauthorizedError } from 'express-jwt';
import { JwtPayload } from 'jsonwebtoken';
import { ILogger } from '../logger/types';
import { isProd } from '../env';
import { HttpStatusCode } from '../types/http-status-code';
import { JWTTokenPayload } from './jwt-types';

type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export class WebTokenGuard {
    private readonly rsaPrivateKeyPath = path.join(__dirname, '..', 'configs', 'auth.pem');

    private readonly rsaPublicKeyPath = path.join(__dirname, '..', 'configs', 'auth-public.pem');

    private readonly rsaPrivateKey: Buffer;

    private readonly rsaPublicKey: Buffer;

    private readonly algorithm = 'RS512';// 'RS256'

    private readonly tokenLifetime = '24h';

    private readonly tokenLifeTimeMs = 24 * 60 * 60 * 1000;

    constructor(
        private logger: ILogger,
        private application: express.Express
    ) {
        this.rsaPrivateKey = fs.readFileSync(this.rsaPrivateKeyPath);
        this.rsaPublicKey = fs.readFileSync(this.rsaPublicKeyPath);

        this.logger.info('[JWT]');
    }

    protect(): AuthenticationMiddleware {
        return expressjwt(
            {
                secret: this.rsaPublicKey,
                algorithms: [this.algorithm],
                getToken: (req: Request) => req.cookies.SESSIONID
            }
        );
    }

    protectRoute(routePath: string, unlessPath?: string): void {
        this.application.use(routePath, expressjwt(
            {
                secret: this.rsaPublicKey,
                algorithms: [this.algorithm],
                getToken: (req: Request) => {
                    const authHeader = req.headers?.authorization;
                    const authHeaderArr = authHeader?.split(' ');
                    if (!authHeaderArr) {
                        return undefined;
                    }
                    return authHeaderArr[1];
                }
            }
        ).unless({ path: unlessPath }));
        this.application.use((err: Errback, _req: Request, res: Response, next: NextFunction) => {
            if (err.name === UnauthorizedError.name) {
                res.sendStatus(HttpStatusCode.UNAUTHORIZED);
                return;
            }
            next(err);
        });
    }

    addJwtTokenCookie(res: Response, subject: string, payload: JWTTokenPayload): void {
        const jwtBearerToken = jwt.sign(payload, this.rsaPrivateKey, {
            algorithm: this.algorithm,
            expiresIn: this.tokenLifetime,
            subject
        });

        res.cookie('SESSIONID', jwtBearerToken, {
            secure: isProd(), // true,
            maxAge: this.tokenLifeTimeMs
        });
    }

    decodeSessionId(token: string): JwtPayload | null {
        let decoded: JwtPayload | null = null;
        try {
            decoded = jwt.decode(token, { json: true });
        } catch (e) {
            this.logger.info('Can\'t decode session id token');
        }

        return decoded;
    }
}
