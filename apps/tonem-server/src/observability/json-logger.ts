import { LoggerService } from '@nestjs/common';

type LogLevel = 'debug' | 'error' | 'fatal' | 'log' | 'verbose' | 'warn';

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, _trace?: string, context?: string): void {
    this.write('error', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string): void {
    const body = this.messageBody(message);
    const entry = {
      ...body,
      timestamp: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
    };
    const serialized = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') console.error(serialized);
    else if (level === 'warn') console.warn(serialized);
    else console.log(serialized);
  }

  private messageBody(message: unknown): Record<string, unknown> {
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      return message as Record<string, unknown>;
    }
    return { message: String(message) };
  }
}
