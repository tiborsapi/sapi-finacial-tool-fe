export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Business',
  'Other',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type IncomeSortField = 'received_on' | 'amount' | 'source' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface Income {
  id: string;
  amount_cents: number;
  source: string;
  category: IncomeCategory;
  description: string | null;
  received_on: string;
  created_at: string;
  updated_at: string;
}

export interface IncomeFilters {
  page: number;
  per_page: number;
  q: string;
  category: string;
  from: string;
  to: string;
  sort_by: IncomeSortField;
  sort_order: SortOrder;
}

export interface IncomeList {
  data: Income[];
  pagination: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
  };
  total_amount_cents: number;
}

export interface IncomeInput {
  amount_cents: number;
  source: string;
  category: IncomeCategory;
  description: string | null;
  received_on: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function listIncomes(filters: IncomeFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') params.set(key, String(value));
  }
  return request<IncomeList>(`/api/incomes?${params}`, { signal });
}

export function createIncome(input: IncomeInput) {
  return request<Income>('/api/incomes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateIncome(id: string, input: IncomeInput) {
  return request<Income>(`/api/incomes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteIncome(id: string) {
  return request<void>(`/api/incomes/${id}`, { method: 'DELETE' });
}
