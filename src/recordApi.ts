export type SortField = 'received_on' | 'amount' | 'source' | 'category';
export type SortOrder = 'asc' | 'desc';

/** An income or an expense: both have the same shape. */
export interface MoneyRecord {
  id: string;
  amount_cents: number;
  source: string;
  category: string;
  description: string | null;
  received_on: string;
  created_at: string;
  updated_at: string;
}

export interface RecordFilters {
  page: number;
  per_page: number;
  q: string;
  category: string;
  from: string;
  to: string;
  sort_by: SortField;
  sort_order: SortOrder;
}

export interface RecordList {
  data: MoneyRecord[];
  pagination: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
  };
  total_amount_cents: number;
}

export interface RecordInput {
  amount_cents: number;
  source: string;
  category: string;
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

export function listRecords(apiPath: string, filters: RecordFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') params.set(key, String(value));
  }
  return request<RecordList>(`${apiPath}?${params}`, { signal });
}

export function createRecord(apiPath: string, input: RecordInput) {
  return request<MoneyRecord>(apiPath, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRecord(apiPath: string, id: string, input: RecordInput) {
  return request<MoneyRecord>(`${apiPath}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteRecord(apiPath: string, id: string) {
  return request<void>(`${apiPath}/${id}`, { method: 'DELETE' });
}
