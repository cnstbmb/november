import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasBackgroundComponent } from './components/canvas-background/canvas-background.component';

@NgModule({
  declarations: [CanvasBackgroundComponent],
  exports: [CanvasBackgroundComponent],
  imports: [CommonModule]
})
export class CanvasBackgroundModule {}
