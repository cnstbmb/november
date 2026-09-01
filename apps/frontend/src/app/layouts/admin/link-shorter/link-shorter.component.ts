import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-link-shorter',
    templateUrl: './link-shorter.component.html',
    styleUrls: ['./link-shorter.component.less'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LinkShorterComponent {}
