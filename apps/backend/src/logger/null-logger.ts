import { ILogger } from './types';

export class NullLogger implements ILogger {
    info(..._params: unknown[]) {
    // do nothing
    }

    warn(..._params: unknown[]) {
    // do nothing
    }

    error(..._params: unknown[]) {
    // do nothing
    }

    debug(..._params: unknown[]) {
    // do nothing
    }
}
