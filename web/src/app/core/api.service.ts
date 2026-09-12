import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface HealthStatus {
  status: string;
  db: string;
  time: string;
}

export interface Coproperty {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  created_at: string;
}

export interface CreateCopropertyInput {
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
}

export interface LotOverviewRow {
  id: string;
  lotNumber: string;
  description: string | null;
  tantiemes: string;
  quotePart: number | null;
  owners: { personId: string; name: string }[];
  ownerLabel: string;
}

export interface CopropertyOverview {
  generalKeyBase: string | null;
  totalTantiemes: string;
  lotCount: number;
  lots: LotOverviewRow[];
}

export interface CreateLotInput {
  lotNumber: string;
  tantiemes: number;
  ownerName?: string | null;
  description?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  health(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>('/health');
  }

  listCoproperties(): Observable<Coproperty[]> {
    return this.http.get<Coproperty[]>('/api/coproperties');
  }

  createCoproperty(input: CreateCopropertyInput): Observable<Coproperty> {
    return this.http.post<Coproperty>('/api/coproperties', input);
  }

  getOverview(copId: string): Observable<CopropertyOverview> {
    return this.http.get<CopropertyOverview>(`/api/coproperties/${copId}/overview`);
  }

  createLot(copId: string, input: CreateLotInput): Observable<CopropertyOverview> {
    return this.http.post<CopropertyOverview>(`/api/coproperties/${copId}/lots`, input);
  }

  updateLotTantiemes(copId: string, lotId: string, tantiemes: number): Observable<CopropertyOverview> {
    return this.http.patch<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}`, { tantiemes });
  }

  setLotOwner(copId: string, lotId: string, name: string): Observable<CopropertyOverview> {
    return this.http.post<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}/owner`, { name });
  }

  deleteLot(copId: string, lotId: string): Observable<CopropertyOverview> {
    return this.http.delete<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}`);
  }
}
