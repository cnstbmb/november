import { ILogger } from './types';

export class ConsoleLogger implements ILogger {
    info(...params: any[]) {
        console.log(...params);
    }

    warn(...params: any[]) {
        console.warn(...params);
    }

    error(...params: any[]) {
        console.error(...params);
    }

    debug(...params: any[]) {
        console.log(...params);
    }
}