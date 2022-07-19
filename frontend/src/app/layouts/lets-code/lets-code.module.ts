import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LetsCodeRoutingModule } from './lets-code-routing.module';
import { LetsCodeComponent } from './lets-code.component';

@NgModule({
  declarations: [LetsCodeComponent],
  imports: [CommonModule, LetsCodeRoutingModule]
})
export class LetsCodeModule {}
