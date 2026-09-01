import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';
import { Route } from '@app/shared/routes';
import { AdminFragments } from '@app/shared/route/fragments';

@Component({
    selector: 'app-admin-menu',
    templateUrl: './menu.component.html',
    styleUrls: ['./menu.component.less'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class MenuComponent implements OnInit {
  readonly adminFragments = AdminFragments;

  fragment: string | null = null;

  constructor(private route: ActivatedRoute, private router: Router, private auth: AuthService) {
    this.fragment = this.route.snapshot.fragment;
  }

  ngOnInit() {
    this.subscribeFragmentChange();
  }

  selectTab(value: string | number | undefined): void {
    if (value === 'logout') {
      this.auth.logout();
      void this.router.navigate([Route.login]);
      return;
    }

    if (value === AdminFragments.newPost || value === AdminFragments.linkShorter) {
      this.updateRouteParamsWithoutReload(value);
    }
  }

  private updateRouteParamsWithoutReload(fragment: AdminFragments): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      fragment
    });
  }

  private subscribeFragmentChange(): void {
    this.route.fragment.subscribe((fragment) => {
      this.fragment = fragment;
    });
  }
}
