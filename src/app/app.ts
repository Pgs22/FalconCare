import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppFooterComponent } from './shared/app-footer/app-footer';
import { LanguageService } from './services/language.service';
import { NavigationScrollResetService } from './services/navigation-scroll-reset.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppFooterComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor(
    _navigationScrollResetService: NavigationScrollResetService,
    languageService: LanguageService
  ) {
    languageService.init();
  }
}
