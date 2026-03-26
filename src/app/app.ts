import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationScrollResetService } from './services/navigation-scroll-reset.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor(_navigationScrollResetService: NavigationScrollResetService) {}
}
