import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
// import cookieParser from 'cookie-parser';
import { expressjwt/* , Request as JWTRequest */ } from 'express-jwt';
import { ILogger } from '../../logger/types';
import { HttpStatusCode } from '../../types/http-status-code';
import { ApplicationRoutes } from '../types';

type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export class Auth extends ApplicationRoutes {
    private readonly rsaPrivateKeyPath = path.join(__dirname, '..', '..', 'configs', 'private.key');

    private readonly rsaPublicKeyPath = path.join(__dirname, '..', '..', 'configs', 'private.key.pub');

    private readonly rsaPrivateKey: Buffer;

    private readonly rsaPublicKey: Buffer;

    private readonly algorithm = 'RS512'// 'RS256'

    private readonly tokenLifetime = '24h';

    private readonly checkIfAuthenticated: AuthenticationMiddleware;

    constructor(logger: ILogger, application: express.Express) {
        super(logger, application);

        this.checkRsaKeys();
        this.rsaPrivateKey = fs.readFileSync(this.rsaPrivateKeyPath);
        this.rsaPublicKey = fs.readFileSync(this.rsaPublicKeyPath);
        this.checkIfAuthenticated = expressjwt(
            { secret: this.rsaPublicKey, algorithms: [this.algorithm] },
        ).unless({ path: ['/api/login'] });
    }

    register(): void {
        this.logger.info('Registering auth route');
        // this.application.use(this.checkIfAuthenticated);
        this.application.route('/api/login')
            .post(this.loginRoute);
        this.application.route('/api/unauth_test').get(this.checkIfAuthenticated, this.test);
    }

    private checkRsaKeys(): void {
        if (!fs.existsSync(this.rsaPrivateKeyPath)) {
            const errorMessage = `RSA private key not found. Path: ${this.rsaPrivateKeyPath}`;
            this.logger.error(errorMessage);
            throw new Error(errorMessage);
        }

        if (!fs.existsSync(this.rsaPublicKeyPath)) {
            const errorMessage = `RSA private key not found. Path: ${this.rsaPublicKeyPath}`;
            this.logger.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    private test(_req: Request, res: Response) {
        res.status(HttpStatusCode.I_AM_A_TEAPOT);
        res.send();
    }

    private loginRoute(req: Request, res: Response) {
        const { email, password: _password } = req.body;

        if (!this.validateEmailAndPassword()) {
            res.sendStatus(HttpStatusCode.UNAUTHORIZED);
            return;
        }

        const userId = this.findUserIdForEmail(email);

        const jwtBearerToken = jwt.sign({}, this.rsaPrivateKey, {
            algorithm: this.algorithm,
            expiresIn: this.tokenLifetime,
            subject: userId,
        });

        // this.addJwtTokenCookie(res, jwtBearerToken);
        this.addJsonJwtToken(res, jwtBearerToken, 0);
        // send the JWT back to the user
        // TODO - multiple options available
        res.status(HttpStatusCode.OK);
        res.send();
    }

    private validateEmailAndPassword(): boolean {
        throw new Error('validateEmailAndPassword() not implemented');
    }

    private findUserIdForEmail(_email: string): string {
        throw new Error('findUserIdForEmail() not implemented');
    }

    // private addJwtTokenCookie(res: Response, token: string): void {
    //     res.cookie('SESSIONID', token, { /* httpOnly: true , */ secure: true });
    // }

    private addJsonJwtToken(res: Response, token: string, expiresIn: number): void {
        res.json({
            idToken: token,
            expiresIn,
        });
    }
}
