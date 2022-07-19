import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AuthModule } from '@app/lib/auth/auth.module';
import { HttpClientModule } from '@angular/common/http';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CookiesStorageService } from '@app/lib/storage/cookies-storage.service';
import { LocalStorageService } from '@app/lib/storage/local-storage.service';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    AuthModule,
    HttpClientModule,
    ToastModule
  ],
  providers: [MessageService, CookiesStorageService, LocalStorageService],
  bootstrap: [AppComponent]
})
export class AppModule {}
