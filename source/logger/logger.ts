import {EventEmitter} from 'events';
import {ProxyLogger} from './proxy-logger';
import {IAppLogger, IChildLoggerSupport, ILogger, IMultistreamLoggerSupport} from './types';

export class Logger extends ProxyLogger implements IAppLogger, IChildLoggerSupport {
    private readonly eventEmitter: EventEmitter;

    constructor(loggerBackend: ILogger, eventEmitter?: EventEmitter) {
        super(loggerBackend);
        this.eventEmitter = eventEmitter || new EventEmitter();
    }

    public child(_data: unknown): IAppLogger {
        throw new Error('Method not implemented.');
    }


    public addStreamBuffer(streamBuffer: unknown) {
        if (this.loggerBackend == null) {
            console.error('Logger is not initialized - can\'t add ringbuffer');
            return;
        }

        if (!this.isMultistreamLoggerSupport(this.loggerBackend)) {
            console.error('Logger does not support multistream');
            return;
        }

        console.log('Adding ringbuffer logger');


        this.loggerBackend.addStreamBuffer(streamBuffer);
    }

    public bindings(): unknown {
        if (this.isChildLoggerSupport(this.loggerBackend)) {
            return this.loggerBackend.bindings();
        } else {
            return {};
        }
    }

    public getEventEmitter(): EventEmitter {
        return this.eventEmitter;
    }


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isChildLoggerSupport(loggerBackend: any): loggerBackend is IChildLoggerSupport {
        return typeof loggerBackend['child'] === 'function';
    }



    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isMultistreamLoggerSupport(loggerBackend: any): loggerBackend is IMultistreamLoggerSupport {
        return typeof loggerBackend['addStreamBuffer'] === 'function';
    }
}