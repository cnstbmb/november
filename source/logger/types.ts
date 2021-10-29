import {EventEmitter} from 'events';

export interface ILogger {
    info(...params: unknown[]): void;

    warn(...params: unknown[]): void;

    error(...params: unknown[]): void;

    debug(...params: unknown[]): void;
}


export interface IChildLoggerSupport {
    child(data: unknown): IAppLogger;

    bindings(): unknown;
}

export interface IMultistreamLoggerSupport {
    addStreamBuffer(stream: unknown): void;
}

export interface IAppLogger extends ILogger, IChildLoggerSupport, IMultistreamLoggerSupport {
    getEventEmitter(): EventEmitter;
}