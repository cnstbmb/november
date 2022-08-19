import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';
import { Route } from '@app/shared/routes';
import { AdminFragments } from '@app/shared/route/fragments';

@Component({
  selector: 'app-admin-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuComponent implements OnInit {
  readonly adminFragments = AdminFragments;

  items!: MenuItem[];

  fragment: string | null = null;

  activeMenuItem!: MenuItem;

  constructor(private route: ActivatedRoute, private router: Router, private auth: AuthService) {
    this.buildMenu();
    this.findActiveItem(this.route.snapshot.fragment);
  }

  ngOnInit() {
    this.subscribeFragmentChange();
  }

  private goNewPost(): void {
    this.updateRouteParamsWithoutReload(AdminFragments.newPost);
  }

  private goLinkShorter(): void {
    this.updateRouteParamsWithoutReload(AdminFragments.linkShorter);
  }

  private logout(): void {
    this.auth.logout();
    this.router.navigate([Route.login]);
  }

  private buildMenu(): void {
    this.items = [
      {
        label: 'New post',
        icon: 'pi pi-fw pi-file',
        fragment: AdminFragments.newPost,
        command: this.goNewPost.bind(this)
      },
      {
        label: 'Link shorter',
        icon: 'pi pi-fw pi-link',
        fragment: AdminFragments.linkShorter,
        command: this.goLinkShorter.bind(this)
      },
      { label: 'Logout', icon: 'pi pi-fw pi-power-off', command: this.logout.bind(this) }
    ];
  }

  private updateRouteParamsWithoutReload(fragment: AdminFragments): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      fragment
    });
  }

  private subscribeFragmentChange(): void {
    this.route.fragment.subscribe(fragment => {
      this.fragment = fragment;
      this.findActiveItem(fragment);
    });
  }

  private findActiveItem(fragment: string | null): void {
    if (!fragment) {
      return;
    }
    this.activeMenuItem =
      this.items?.find(item => item.fragment === fragment) || this.activeMenuItem;
  }
}
