import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ApplicationRoutes } from '../types';
import { ILogger } from '../../logger/types';
import { HttpStatusCode } from '../../lib/types/http-status-code';

export class Frontend extends ApplicationRoutes {
    private readonly angularAppDist = path.join(__dirname, '..', '..', 'static');

    constructor(logger: ILogger, application: express.Express) {
        super(logger, application);
    }

    register(): void {
        this.logger.info('Registering frontend static routes');
        this.application.get('*.*', express.static(this.angularAppDist));
        this.application.all('*', (_req: Request, res: Response) => {
            if (!fs.existsSync(this.angularAppDist)) {
                this.logger.warn('Compiled application not found');
                res.status(HttpStatusCode.NOT_FOUND).send('application not found.');
                return;
            }
            res.status(HttpStatusCode.OK).sendFile('/', { root: this.angularAppDist });
        });
    }
}
