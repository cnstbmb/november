import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';

export const ENVIRONMENT = new InjectionToken<{ [key: string]: string }>('environment');

@Injectable()
export class EnvironmentService {
  private readonly environment: any;

  constructor(@Optional() @Inject(ENVIRONMENT) environment: any) {
    this.environment = environment !== null ? environment : {};
  }

  getValue(key: string, defaultValue?: any): any {
    return this.environment[key] || defaultValue;
  }
}
