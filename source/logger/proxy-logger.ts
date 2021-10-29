import {ILogger} from './types';

export class ProxyLogger implements ILogger {
    constructor(protected loggerBackend: ILogger) {
    }

    info(...params: unknown[]) {
        this.loggerBackend.info(...params);
    }

    warn(...params: unknown[]) {
        this.loggerBackend.warn(...params);
    }

    error(...params: unknown[]) {
        this.loggerBackend.error(...params);
    }

    debug(...params: unknown[]) {
        this.loggerBackend.debug(...params);
    }
}