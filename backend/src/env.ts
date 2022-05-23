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

export function logLevel(): string | undefined {
    return process.env.LOG_LEVEL;
}

export function showSrc(): boolean {
    return process.env.SHOW_SRC === 'true';
}

export function logToFile(): string | undefined {
    return process.env.LOG_TO_FILE;
}

export function prettyLogs(): boolean {
    return process.env.PRETTY_LOGS !== '0';
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
