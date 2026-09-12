import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type HealthStatus } from '../core/api.service';

type HealthState = { kind: 'loading' } | { kind: 'ok'; data: HealthStatus } | { kind: 'error' };

@Component({
  selector: 'app-dashboard',
  imports: [TranslocoModule],
  template: `
    <ng-container *transloco="let t">
      <div class="grid stats">
        <div class="card stat">
          <div class="label">{{ t('health.label') }}</div>
          <div class="value">
            @switch (health().kind) {
              @case ('loading') { <span class="pill neutral">{{ t('health.checking') }}</span> }
              @case ('ok') { <span class="pill good">{{ t('health.ok') }}</span> }
              @case ('error') { <span class="pill critical">{{ t('health.down') }}</span> }
            }
          </div>
        </div>
      </div>

      <div class="banner tip">{{ t('dashboard.socleNote') }}</div>
    </ng-container>
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  readonly health = signal<HealthState>({ kind: 'loading' });

  ngOnInit(): void {
    this.api.health().subscribe({
      next: (data) => this.health.set({ kind: 'ok', data }),
      error: () => this.health.set({ kind: 'error' }),
    });
  }
}
