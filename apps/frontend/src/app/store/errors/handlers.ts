import { Injectable } from '@angular/core';

import { ErrorHandlerParams } from '@app/store/types';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class EffectErrorHandler {
  constructor(private messageService: MessageService) {}

  handle(params: ErrorHandlerParams): void {
    const { message, error } = params;
    console.error(`[${message}] ERROR: "${error}"`);
    if (this.messageService) {
      this.messageService.add({ severity: 'error', summary: message, detail: error });
    }
  }
}
