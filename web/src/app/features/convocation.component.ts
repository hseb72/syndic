import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ApiService,
  type Annex,
  type Assembly,
  type BudgetResult,
  type ComparisonResult,
  type Coproperty,
  type DashboardSummary,
  type ReceivableRow,
  type RegularisationReport,
  type Resolution,
} from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';

interface AnnexData {
  annex: Annex;
  exerciseLabel: string | null;
  budget?: BudgetResult;
  comparison?: ComparisonResult;
  regularisation?: RegularisationReport;
  impayes?: ReceivableRow[];
  dashboard?: DashboardSummary;
}

@Component({
  selector: 'app-convocation',
  imports: [TranslocoModule, DecimalPipe, FormsModule],
  templateUrl: './convocation.component.html',
})
export class ConvocationComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);

  readonly copId = signal<string | null>(null);
  readonly coproperty = signal<Coproperty | null>(null);
  readonly assembly = signal<Assembly | null>(null);
  readonly resolutions = signal<Resolution[]>([]);
  readonly annexData = signal<AnnexData[]>([]);
  readonly format = signal<'SIMPLIFIE' | 'REGLEMENTAIRE'>('SIMPLIFIE');
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    let cop: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    const id = this.route.snapshot.paramMap.get('id');
    if (!cop || !id) {
      this.loading.set(false);
      return;
    }

    try {
      // Le détail de l'assemblée est critique ; la copropriété et les exercices
      // sont accessoires (chargés séparément pour ne pas tout invalider si l'un
      // échoue).
      const detail = await firstValueFrom(this.api.getAssembly(cop, id));
      this.assembly.set(detail.assembly);
      this.resolutions.set(detail.resolutions);

      const cops = await firstValueFrom(this.api.listCoproperties()).catch(() => [] as Coproperty[]);
      this.coproperty.set(cops.find((c) => c.id === cop) ?? null);
      const exercises = await firstValueFrom(this.api.listExercises(cop)).catch(() => [] as { id: string; label: string | null }[]);
      const exLabel = (exId: string | null) => exercises.find((e) => e.id === exId)?.label ?? null;

      const data: AnnexData[] = [];
      for (const an of detail.annexes) {
        const d: AnnexData = { annex: an, exerciseLabel: exLabel(an.exercise_id) };
        try {
          if (an.report_type === 'BUDGET' && an.exercise_id) d.budget = await firstValueFrom(this.api.getBudget(cop, an.exercise_id));
          else if (an.report_type === 'COMPARATIF' && an.exercise_id) d.comparison = await firstValueFrom(this.api.getBudgetComparison(cop, an.exercise_id));
          else if (an.report_type === 'REGULARISATION' && an.exercise_id) d.regularisation = await firstValueFrom(this.api.getRegularisationReport(cop, an.exercise_id));
          else if (an.report_type === 'IMPAYES') d.impayes = (await firstValueFrom(this.api.listReceivables(cop, an.exercise_id ?? undefined))).filter((r) => r.remaining > 0);
          else if (an.report_type === 'TRESORERIE') d.dashboard = await firstValueFrom(this.api.getDashboard(cop, an.exercise_id ?? undefined));
        } catch {
          /* annexe sans données : affichée vide */
        }
        data.push(d);
      }
      this.annexData.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  print(): void {
    window.print();
  }

  num(n: string | number): number {
    return Number(n);
  }

  daysBefore(): number | null {
    const a = this.assembly();
    if (!a?.convocation_date || !a.meeting_date) return null;
    const c = new Date(a.convocation_date).getTime();
    const m = new Date(a.meeting_date).getTime();
    return Math.round((m - c) / (1000 * 60 * 60 * 24));
  }

  // Réglementaire : numérotation « Annexe N » des seules annexes comptables.
  annexNumber(i: number): number {
    return this.annexData().slice(0, i + 1).filter((d) => d.annex.report_type !== 'LIBRE').length;
  }

  impayesTotal(rows: ReceivableRow[]): number {
    return Math.round(rows.reduce((s, r) => s + r.remaining, 0) * 100) / 100;
  }
}
