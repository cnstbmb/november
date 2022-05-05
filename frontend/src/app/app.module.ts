import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { CanvasBackgroundModule } from '@app/canvas-background/canvas-background.module';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, AppRoutingModule, CanvasBackgroundModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
