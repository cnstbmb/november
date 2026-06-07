import fs from 'fs';
import pinoms from 'pino-multi-stream';
import pino from 'pino';
import pinoCaller from 'pino-caller';

export function createPinoLogger(name: string, level: pino.LevelWithSilent, settings?: {
    showSrc?: boolean,
    logFile?: string,
    noConsoleLogs?: boolean,
    prettyPrint?: boolean
}) {
    const streams: pinoms.Streams = [];

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
            stream
        });
        streams.push({
            level: 'warn',
            stream
        });
    }

    const multistream = pinoms.multistream(streams);
    let logger = pino({
        name,
        level
    // prettyPrint: settings && settings.prettyPrint
    }, multistream);
    // logger.multistream = multistream;

    if (settings && settings.showSrc) {
        logger = pinoCaller(logger);
    }

    // logger.addStreamBuffer = function (streamBuffer: string | object) {
    //     this.multistream.add({
    //         level: 'trace',
    // Нам нужны строки. Если хочется получить объекты то можно использовать raw
    //         type: 'stream',
    //         stream: streamBuffer,
    //     });
    // };

    logger.warn('Pino was constructed');

    return logger;
}
