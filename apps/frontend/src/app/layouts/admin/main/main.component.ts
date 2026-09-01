import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.less'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class MainComponent {}
