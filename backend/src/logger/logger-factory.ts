import pino from 'pino';
import fse from 'fs-extra';
import * as env from '../env';
import { NullLogger } from './null-logger';
import { ConsoleLogger } from './console-logger';
import { Logger } from './logger';
import { createPinoLogger } from './pino-logger';

const logLevel: pino.LevelWithSilent = env.logLevel() || (env.isProd() ? 'info' : 'trace');
const showSrc = env.showSrc();
const logToFile = env.logToFile();

const logFile = (logToFile) ? `${logToFile}/${env.currentEnv()}.log` : undefined;

const noLogs = logLevel === 'silent';

const prettyPrint = process.stdout.isTTY && env.prettyLogs();

function createLogFile(filePath?: string): void {
    if (!filePath) {
        return;
    }

    fse.ensureFileSync(filePath);
}

export function makeLogger() {
    let loggerBackend;

    if (noLogs) {
        console.log('Initializing logger: NullLogger');
        loggerBackend = new NullLogger();
    } else if (env.isTest()) {
        loggerBackend = new ConsoleLogger();
    } else {
        createLogFile(logFile);
        const settings = {
            showSrc,
            logFile,
            prettyPrint,
            noConsoleLogs: env.noConsoleLog()
        };

        console.log(`Initializing logger: pino.Logger level: ${logLevel} settings: ${JSON.stringify(settings)}`);

        loggerBackend = createPinoLogger('web_local', logLevel, settings);
    }

    return new Logger(loggerBackend);
}
