import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AuthModule } from '@lib/auth/auth.module';
import { HttpClientModule } from '@angular/common/http';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CookiesStorageService } from '@lib/storage/cookies-storage.service';
import { LocalStorageService } from '@lib/storage/local-storage.service';
import { environment } from 'src/environments/environment';
import { BlogModule } from '@lib/blog/blog.module';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ENVIRONMENT, EnvironmentService } from './environment';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    AuthModule,
    HttpClientModule,
    ToastModule,
    BlogModule
  ],
  providers: [
    MessageService,
    CookiesStorageService,
    LocalStorageService,
    EnvironmentService,
    { provide: ENVIRONMENT, useValue: environment }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
