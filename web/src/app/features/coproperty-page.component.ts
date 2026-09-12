import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type Coproperty } from '../core/api.service';

@Component({
  selector: 'app-coproperty-page',
  imports: [TranslocoModule, ReactiveFormsModule],
  template: `
    <ng-container *transloco="let t">
      <div class="card">
        <div class="card-head">
          <div>
            <h2>{{ t('coprop.title') }}</h2>
            @if (!loading()) {
              <div class="hint">{{ t('coprop.count', { n: items().length }) }}</div>
            }
          </div>
          <button class="btn primary" type="button" (click)="showForm.set(!showForm())">
            {{ t('coprop.add') }}
          </button>
        </div>

        @if (showForm()) {
          <form class="panel" [formGroup]="form" (ngSubmit)="submit()">
            <div class="form-grid">
              <div class="field">
                <label for="name">{{ t('field.name') }}</label>
                <input id="name" type="text" formControlName="name" />
              </div>
              <div class="field">
                <label for="address">{{ t('field.address') }}</label>
                <input id="address" type="text" formControlName="address" />
              </div>
              <div class="field">
                <label for="postalCode">{{ t('field.postalCode') }}</label>
                <input id="postalCode" type="text" formControlName="postalCode" />
              </div>
              <div class="field">
                <label for="city">{{ t('field.city') }}</label>
                <input id="city" type="text" formControlName="city" />
              </div>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit" [disabled]="form.invalid || saving()">
                {{ t('btn.save') }}
              </button>
              <button class="btn ghost" type="button" (click)="showForm.set(false)">
                {{ t('btn.cancel') }}
              </button>
            </div>
          </form>
        }

        @if (loading()) {
          <div class="empty">{{ t('health.checking') }}</div>
        } @else if (items().length === 0) {
          <div class="empty">{{ t('coprop.empty') }}</div>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ t('field.name') }}</th>
                  <th>{{ t('field.address') }}</th>
                  <th>{{ t('field.city') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (c of items(); track c.id) {
                  <tr>
                    <td>{{ c.name }}</td>
                    <td>{{ c.address }}</td>
                    <td>{{ c.city }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </ng-container>
  `,
})
export class CopropertyPageComponent implements OnInit {
  private api = inject(ApiService);

  readonly items = signal<Coproperty[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showForm = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.listCoproperties().subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    this.api
      .createCoproperty({
        name: v.name,
        address: v.address || null,
        postalCode: v.postalCode || null,
        city: v.city || null,
      })
      .subscribe({
        next: (created) => {
          this.items.update((list) => [...list, created]);
          this.form.reset();
          this.showForm.set(false);
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }
}
