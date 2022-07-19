import express from 'express';
import { ILogger } from '../logger/types';

export abstract class ApplicationRoutes {
    protected constructor(protected logger: ILogger, protected application: express.Express) {
    }

    abstract register(): void
}
