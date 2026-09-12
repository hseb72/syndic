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

export interface Exercise {
  id: string;
  label: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  amount: string;
  category: string | null;
  status: string;
  exerciseId: string;
  supplierName: string;
  paidAmount: string;
}

export interface InvoiceDistributionInput {
  keyCode: 'GENERAL' | 'EAU';
  label?: string | null;
  amount: number;
  periodLabel?: string | null;
}

export interface CreateInvoiceInput {
  supplierId: string;
  exerciseId: string;
  invoiceDate: string;
  amount: number;
  category?: string | null;
  invoiceNumber?: string | null;
  distributions?: InvoiceDistributionInput[];
}

export interface ChargesResult {
  exerciseId: string;
  total: number;
  byLot: { lotId: string; lotNumber: string; amount: number }[];
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

  listExercises(copId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`/api/coproperties/${copId}/exercises`);
  }

  createExercise(copId: string, input: { label: string; startDate: string; endDate: string }): Observable<Exercise> {
    return this.http.post<Exercise>(`/api/coproperties/${copId}/exercises`, input);
  }

  listSuppliers(copId: string): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`/api/coproperties/${copId}/suppliers`);
  }

  createSupplier(copId: string, name: string): Observable<Supplier> {
    return this.http.post<Supplier>(`/api/coproperties/${copId}/suppliers`, { name });
  }

  listInvoices(copId: string, exerciseId: string): Observable<InvoiceRow[]> {
    return this.http.get<InvoiceRow[]>(`/api/coproperties/${copId}/invoices?exerciseId=${exerciseId}`);
  }

  createInvoice(copId: string, input: CreateInvoiceInput): Observable<unknown> {
    return this.http.post(`/api/coproperties/${copId}/invoices`, input);
  }

  getCharges(copId: string, exerciseId: string): Observable<ChargesResult> {
    return this.http.get<ChargesResult>(`/api/coproperties/${copId}/exercises/${exerciseId}/charges`);
  }
}
