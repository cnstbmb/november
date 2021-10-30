import express from 'express';
import * as http from 'http';
import { serverPort } from './env';
import { ILogger } from './logger/types';
import { Request, Response } from 'express'

export class Server {
    private application: express.Express;
    private port: number = serverPort();
    private server: http.Server | undefined;
 
    constructor(private logger: ILogger) {
        this.application = express();
    }

    start(): void {
        this.server = this.application.listen(this.port, () => {
            this.logger.info(`Example app listening at http://localhost:${this.port}`)
        })
    }

    registerRoutes(): void {
        this.logger.info('Registration routes');
        this.routeTest();
        this.logger.info('Registration routes success')
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
}