import fs, { WriteStream as FSWriteStream } from 'fs';
import pinoms from 'pino-multi-stream';
import pino from 'pino';
import pinoCaller from 'pino-caller';
import { WriteStream as NodeWriteStream } from 'node:tty';

interface Stream {
    level: string;
    stream: FSWriteStream | (NodeWriteStream & { fd: number });
}

export function createPinoLogger(name: string, level: string, settings?: {
    showSrc?: boolean,
    logFile?: string,
    noConsoleLogs?: boolean,
    prettyPrint?: boolean
}) {
    const streams: Stream[] = [];

    if (!(settings && settings.noConsoleLogs)) {
        console.log('Adding console logs');
        streams.push({ level, stream: process.stdout });
    }

    const logFile = settings && settings.logFile;
    if (logFile) {
        console.log('Will write logs to file');

        const stream = fs.createWriteStream(logFile, { flags: 'a' });
        streams.push({
            level: 'debug',
            stream,
        });
        streams.push({
            level: 'warn',
            stream,
        });
    }

    const multistream = pinoms.multistream(streams);
    let logger = pino({
        name,
        level,
    // prettyPrint: settings && settings.prettyPrint
    }, multistream);
    logger.multistream = multistream;

    if (settings && settings.showSrc) {
        logger = pinoCaller(logger);
    }

    logger.addStreamBuffer = function (streamBuffer: string | object) {
        this.multistream.add({
            level: 'trace',
            type: 'stream', // Нам нужны строки. Если хочется получить объекты то можно использовать raw
            stream: streamBuffer,
        });
    };

    logger.warn('Pino was constructed');

    return logger;
}
