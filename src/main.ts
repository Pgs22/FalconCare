import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { registerLocaleData } from '@angular/common';
import localeCa from '@angular/common/locales/ca';

registerLocaleData(localeCa);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
