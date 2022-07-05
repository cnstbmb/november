import pino from 'pino';

const AVAILABLE_ENVS = {
    PROD: 'prod',
    DEV: 'dev',
    TEST: 'test',
};

export function serverPort(): number {
    return +(process?.env?.PORT || 3000);
}

export function currentEnv(): string {
    return process.env.NODE_ENV || '';
}

export function logLevel(): pino.LevelWithSilent | undefined {
    const level = process.env.LOG_LEVEL;
    if (!level) {
        return undefined;
    }

    const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
    if (!levels.includes(level)) {
        throw new Error(`NOT CORRECT LOG LEVEL, use one from "${level.toString()}"`);
    }

    return level as pino.LevelWithSilent;
}

export function showSrc(): boolean {
    return process.env.SHOW_SRC === 'true';
}

export function logToFile(): string | undefined {
    return process.env.LOG_TO_FILE;
}

export function prettyLogs(): boolean {
    return !!process.env.PRETTY_LOGS;
}

export function noConsoleLog(): boolean {
    return process.env.NO_CONSOLE_LOGS === '1';
}

export function isProd() {
    return currentEnv() === AVAILABLE_ENVS.PROD;
}

export function isDev() {
    return currentEnv() === AVAILABLE_ENVS.PROD;
}

export function isTest() {
    return currentEnv() === AVAILABLE_ENVS.PROD;
}
