import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AuthModule } from '@lib/auth/auth.module';
import { HttpClientModule } from '@angular/common/http';
import { ToastModule } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { CookiesStorageService } from '@lib/storage/cookies-storage.service';
import { LocalStorageService } from '@lib/storage/local-storage.service';
import { BlogModule } from '@lib/blog/blog.module';
import { RippleModule } from 'primeng/ripple';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { EffectsModule } from '@ngrx/effects';
import { StoreRouterConnectingModule } from '@ngrx/router-store';
import { ENVIRONMENT, EnvironmentService } from './environment';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { environment } from '../environments/environment';
import * as fromStore from './store';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    AuthModule,
    HttpClientModule,
    ToastModule,
    BlogModule,
    RippleModule,
    StoreModule.forRoot(fromStore.reducers, { metaReducers: fromStore.metaReducers }),
    StoreDevtoolsModule.instrument({ maxAge: 25, logOnly: environment.production }),
    EffectsModule.forRoot(fromStore.effects),
    StoreRouterConnectingModule.forRoot()
  ],
  providers: [
    MessageService,
    CookiesStorageService,
    LocalStorageService,
    EnvironmentService,
    ConfirmationService,
    { provide: ENVIRONMENT, useValue: environment }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
