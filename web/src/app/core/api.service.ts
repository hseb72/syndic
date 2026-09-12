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
}
