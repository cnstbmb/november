import * as http from 'http';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { serverPort } from '../env';
import { ILogger } from '../logger/types';

export class Server {
    private application: express.Express;

    private port: number = serverPort();

    private server: http.Server | undefined;

    private readonly angularAppDist = path.join(__dirname, '..', 'static');

    constructor(private logger: ILogger) {
        this.application = express();
    }

    start(): void {
        this.server = this.application.listen(this.port, () => {
            this.logger.info(`Example app listening at http://localhost:${this.port}`);
        });
    }

    registerRoutes(): void {
        this.logger.info('Registration routes');
        this.registerMiddleWares();
        this.routeTest();
        this.registerFrontendStatic();
        this.logger.info('Registration routes success');
    }

    stop(): void {
        if (!this.server) {
            this.logger.warn('Server not started');
            return;
        }

        this.server.close();
        process.exit(0);
    }

    private routeTest(): void {
        this.logger.info('test');
        this.application.get('/test', (_req: Request, res: Response) => {
            this.logger.info('Hello World! shutting down');
            res.send('Hello World! shutting down');
            this.stop();
        });
    }

    private registerFrontendStatic(): void {
        this.application.get('*.*', express.static(this.angularAppDist));
        this.application.all('*', (_req: Request, res: Response) => {
            if (!fs.existsSync(this.angularAppDist)) {
                this.logger.warn('Compiled application not found');
                res.status(404).send('application not found.');
                return;
            }
            res.status(200).sendFile('/', { root: this.angularAppDist });
        });
    }

    private registerMiddleWares() {
        this.application.use((req: Request, _res: Response, next) => {
            this.logger.info(`method: ${req.method}; url: ${req.url}`);
            next();
        });
    }
}
