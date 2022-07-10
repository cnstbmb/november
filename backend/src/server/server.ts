import * as http from 'http';
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { isDev, serverPort } from '../env';
import { ILogger } from '../logger/types';
import { Routes } from '../routes/routes';

export class Server {
    private port: number = serverPort();

    private server: http.Server | undefined;

    constructor(
        private logger: ILogger,
        private routes: Routes,
        private application: express.Express,
    ) {
    }

    start(): void {
        this.server = this.application.listen(this.port, () => {
            this.logger.info(`Example app listening at ${this.port}`);
        });
    }

    stop(): void {
        if (!this.server) {
            this.logger.warn('Server not started');
            return;
        }

        this.server.close();
        process.exit(0);
    }

    registerRoutes(): void {
        this.logger.info('Registration routes');
        this.registerMiddleWares();
        this.corsRequestForLocalDev();
        this.routes.register();
        this.logger.info('Registration routes success');
    }

    private registerMiddleWares() {
        this.application.use(bodyParser.json());
        this.application.use((req: Request, _res: Response, next) => {
            this.logger.info(`method: ${req.method}; url: ${req.url}`);
            next();
        });
    }

    private corsRequestForLocalDev(): void {
        if (!isDev) {
            return;
        }
        this.application.use(cors());
    }
}
