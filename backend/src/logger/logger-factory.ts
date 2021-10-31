import * as env from '../env';
import { NullLogger } from './null-logger';
import { ConsoleLogger } from './console-logger';
import { Logger } from './logger';
import { createPinoLogger } from './pino-logger';

const logLevel = env.logLevel() || (env.isProd() ? 'info' : 'trace');
const showSrc = env.showSrc();
const logToFile = env.logToFile();

const logFile = (logToFile) ? `${logToFile}/${env.currentEnv()}.log` : undefined;

const noLogs = logLevel === 'none';

const prettyPrint = process.stdout.isTTY && env.prettyLogs();

export function makeLogger() {
    let loggerBackend;

    if (noLogs) {
        console.log('Initializing logger: NullLogger');
        loggerBackend = new NullLogger();
    } else if (env.isTest()) {
        loggerBackend = new ConsoleLogger();
    } else {
        const settings = {
            showSrc,
            logFile,
            prettyPrint,
            noConsoleLogs: env.noConsoleLog(),
        };

        console.log(`Initializing logger: pino.Logger level: ${logLevel} settings: ${JSON.stringify(settings)}`);

        loggerBackend = createPinoLogger('web_local', logLevel, settings);
    }

    return new Logger(loggerBackend);
}
