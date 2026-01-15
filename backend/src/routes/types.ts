import express from 'express';
import { ILogger } from '../logger/types';
import { WebTokenGuard } from './web-token.guard';

export abstract class ApplicationRoutes {
    protected constructor(
        protected logger: ILogger,
        protected application: express.Express,
        protected webTokenGuard: WebTokenGuard
    ) {

    }

    abstract register(): void;
}
