import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { MoneyRecord, RecordInput } from './recordApi';

/** A tiny in-memory backend serving both /api/incomes and /api/expenses. */
const fetchMock = vi.fn<typeof fetch>();
let store: Record<string, MoneyRecord[]>;
let nextId: number;
let failNextList: string | null;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function record(overrides: Partial<MoneyRecord> & { source: string }): MoneyRecord {
  nextId += 1;
  return {
    id: `r-${nextId}`,
    amount_cents: 1000,
    category: 'Other',
    description: null,
    received_on: '2026-01-01',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

function listResponse(rows: MoneyRecord[], params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  const perPage = Number(params.get('per_page') ?? '8');
  const q = params.get('q')?.toLowerCase();
  const filtered = rows
    .filter((row) => !q || `${row.source} ${row.description ?? ''}`.toLowerCase().includes(q))
    .filter((row) => !params.get('category') || row.category === params.get('category'))
    .filter((row) => !params.get('from') || row.received_on >= params.get('from')!)
    .filter((row) => !params.get('to') || row.received_on <= params.get('to')!);
  const direction = params.get('sort_order') === 'asc' ? 1 : -1;
  if (params.get('sort_by') === 'amount') {
    filtered.sort((a, b) => (a.amount_cents - b.amount_cents) * direction);
  } else {
    filtered.sort((a, b) => a.received_on.localeCompare(b.received_on) * direction);
  }
  const offset = (page - 1) * perPage;
  return json({
    data: filtered.slice(offset, offset + perPage),
    pagination: {
      page,
      per_page: perPage,
      total_items: filtered.length,
      total_pages: Math.ceil(filtered.length / perPage),
    },
    total_amount_cents: filtered.reduce((sum, row) => sum + row.amount_cents, 0),
  });
}

beforeEach(() => {
  nextId = 0;
  failNextList = null;
  store = { '/api/incomes': [], '/api/expenses': [] };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const [, , collection, id] = url.pathname.split('/');
    const path = `/api/${collection}`;
    const rows = store[path];
    if (!rows) return json({ error: 'Unexpected request' }, 404);

    const method = init?.method ?? 'GET';
    if (method === 'GET' && !id) {
      if (failNextList === path) {
        failNextList = null;
        return json({ error: 'Database is down' }, 500);
      }
      return listResponse(rows, url.searchParams);
    }
    if (method === 'POST') {
      const created = record(JSON.parse(String(init?.body)) as RecordInput);
      rows.push(created);
      return json(created, 201);
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as RecordInput;
      store[path] = rows.map((row) => (row.id === id ? { ...row, ...body } : row));
      return json(store[path].find((row) => row.id === id));
    }
    if (method === 'DELETE') {
      store[path] = rows.filter((row) => row.id !== id);
      return json(undefined, 204);
    }
    return json({ error: 'Unexpected request' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function renderAt(path: string) {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={[path]}
    >
      <App />
    </MemoryRouter>,
  );
}

const requests = (method?: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === (method ?? 'GET'));
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
const dialog = () => within(screen.getByRole('dialog'));
// Re-query on every use: switching pages remounts the whole shell, so old nodes go stale.
const nav = () => within(screen.getByRole('navigation', { name: 'Main navigation' }));

describe('Expenses page', () => {
  it('shows the expense wording and loads from the expenses endpoint', async () => {
    renderAt('/expenses');

    expect(await screen.findByText('No expenses recorded yet')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Expenses');
    expect(screen.getByText('TOTAL EXPENSES', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add expense/ })).toBeTruthy();
    expect(urls().every((url) => url.startsWith('/api/expenses?'))).toBe(true);

    const filterOptions = within(screen.getByLabelText('Filter by category'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(filterOptions).toEqual([
      'All categories', 'Rent', 'Food', 'Transport', 'Utilities', 'Health', 'Other',
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Add expense/ }));
    const formOptions = within(dialog().getByLabelText('Category'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(formOptions).toEqual(['Rent', 'Food', 'Transport', 'Utilities', 'Health', 'Other']);
  });

  it('creates, edits, and deletes expenses through /api/expenses', async () => {
    renderAt('/expenses');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await screen.findByText('No expenses recorded yet');

    fireEvent.click(screen.getByRole('button', { name: /Add expense/ }));
    expect(dialog().getByText('Spent on')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Weekly groceries' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '84.5' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText('Weekly groceries')).toBeTruthy();
    const [createUrl, createInit] = requests('POST')[0];
    expect(createUrl).toBe('/api/expenses');
    expect(JSON.parse(String(createInit?.body))).toEqual({
      amount_cents: 8450,
      source: 'Weekly groceries',
      category: 'Rent', // first expense category is the default
      description: null,
      received_on: expect.any(String),
    });
    // Expenses are shown as money going out.
    expect(document.querySelector('.amount-cell')?.textContent).toBe('−$84.50');
    expect(document.querySelector('.source-cell small')?.textContent).toBe('Expense recorded');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekly groceries' }));
    expect((screen.getByLabelText('Source') as HTMLInputElement).value).toBe('Weekly groceries');
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('84.50');
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Market' } });
    fireEvent.change(dialog().getByLabelText('Category'), { target: { value: 'Food' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Market')).toBeTruthy();
    expect(requests('PUT')[0][0]).toBe('/api/expenses/r-1');
    expect(store['/api/expenses'][0].category).toBe('Food');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Market' }));
    expect(await screen.findByText('No expenses recorded yet')).toBeTruthy();
    expect(requests('DELETE')[0][0]).toBe('/api/expenses/r-1');
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete the expense from "Market"? This cannot be undone.',
    );
    expect(store['/api/incomes']).toEqual([]);
  });

  it.each(['1.234', '0', '-5', 'abc', '1e3', '.5'])(
    'rejects the amount %s before calling the API',
    async (amount) => {
      renderAt('/expenses');
      fireEvent.click(await screen.findByRole('button', { name: /Add expense/ }));
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Bad amount' } });
      fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: amount } });
      fireEvent.click(dialog().getByRole('button', { name: 'Add expense' }));

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Enter an amount greater than zero',
      );
      expect(requests('POST')).toHaveLength(0);
    },
  );

  it('shows the server error and keeps the form open when saving fails', async () => {
    renderAt('/expenses');
    fireEvent.click(await screen.findByRole('button', { name: /Add expense/ }));
    fetchMock.mockImplementationOnce(async () =>
      json({ error: 'Choose a valid expense category' }, 422),
    );
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Rejected' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '5' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Add expense' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Choose a valid expense category');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Source') as HTMLInputElement).value).toBe('Rejected');
  });

  it('explains when filters match nothing, without offering to add a record', async () => {
    store['/api/expenses'] = [record({ source: 'Coffee', category: 'Food' })];
    renderAt('/expenses');
    await screen.findByText('Coffee');

    fireEvent.change(screen.getByLabelText('Search expense'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No matching expense')).toBeTruthy();
    expect(screen.getByText('Try adjusting your filters.')).toBeTruthy();
    expect(screen.queryByText('Add your first expense')).toBeNull();
  });

  it('shows an error with a working retry when loading fails', async () => {
    failNextList = '/api/expenses';
    renderAt('/expenses');

    expect(await screen.findByText('We couldn’t load your expense')).toBeTruthy();
    expect(screen.getByText('Database is down')).toBeTruthy();

    store['/api/expenses'] = [record({ source: 'Recovered' })];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recovered')).toBeTruthy();
    expect(screen.queryByText('We couldn’t load your expense')).toBeNull();
  });

  it('reports a failed delete as a delete error, not as a load error', async () => {
    store['/api/expenses'] = [record({ source: 'Stuck' })];
    renderAt('/expenses');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await screen.findByText('Stuck');

    fetchMock.mockImplementationOnce(async () => json({ error: 'Expense record not found' }, 404));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Stuck' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Expense record not found');
    expect(screen.queryByText('We couldn’t load your expense')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('Stuck')).toBeTruthy(); // the row is still listed
  });

  it('does not delete anything when the confirmation is declined', async () => {
    store['/api/expenses'] = [record({ source: 'Keep me' })];
    renderAt('/expenses');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Keep me' }));
    expect(requests('DELETE')).toHaveLength(0);
    expect(screen.getByText('Keep me')).toBeTruthy();
  });

  it('closes the form without saving when cancelled', async () => {
    renderAt('/expenses');
    fireEvent.click(await screen.findByRole('button', { name: /Add expense/ }));
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Never saved' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requests('POST')).toHaveLength(0);
  });
});

describe('Income page next to expenses', () => {
  it('keeps income wording, endpoint, categories and amount sign', async () => {
    store['/api/incomes'] = [record({ source: 'Pay', amount_cents: 250_000, category: 'Salary' })];
    renderAt('/');

    await screen.findByText('Pay');
    expect(urls().every((url) => url.startsWith('/api/incomes?'))).toBe(true);
    const options = within(screen.getByLabelText('Filter by category'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['All categories', 'Salary', 'Freelance', 'Investments', 'Business', 'Other']);
    expect(document.querySelector('.amount-cell')?.textContent).toBe('+$2,500.00');
    expect(document.querySelector('.amount-cell')?.className).not.toContain('amount-expense');
  });
});

describe('Navigation between income and expenses', () => {
  beforeEach(() => {
    store['/api/incomes'] = [record({ source: 'Salary job', category: 'Salary' })];
    store['/api/expenses'] = [record({ source: 'Landlord', category: 'Rent' })];
  });

  it('marks the current page in the sidebar and switches the data with it', async () => {
    renderAt('/');
    await screen.findByText('Salary job');
    expect(nav().getByRole('link', { name: /Income/ }).getAttribute('aria-current')).toBe('page');
    expect(nav().getByRole('link', { name: /Expenses/ }).getAttribute('aria-current')).toBeNull();

    fireEvent.click(nav().getByRole('link', { name: /Expenses/ }));
    await screen.findByText('Landlord');
    expect(nav().getByRole('link', { name: /Expenses/ }).getAttribute('aria-current')).toBe('page');
    expect(nav().getByRole('link', { name: /Income/ }).getAttribute('aria-current')).toBeNull();
    expect(screen.queryByText('Salary job')).toBeNull();

    fireEvent.click(nav().getByRole('link', { name: /Income/ }));
    await screen.findByText('Salary job');
    expect(screen.queryByText('Landlord')).toBeNull();
  });

  it('does not carry filters, search, page or open dialogs across pages', async () => {
    renderAt('/');
    await screen.findByText('Salary job');

    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'Salary' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('Search income'), { target: { value: 'Salary' } });
    await waitFor(() => expect(urls().some((url) => url.includes('q=Salary'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Add income/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /Add income/ }));

    fireEvent.click(nav().getByRole('link', { name: /Expenses/ }));
    await screen.findByText('Landlord');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Filter by category') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Search expense') as HTMLInputElement).value).toBe('');
    const lastExpenseList = urls().filter((url) => url.startsWith("/api/expenses?")).pop()!;
    expect(lastExpenseList).not.toMatch(/category=|from=|q=/);
    expect(lastExpenseList).toContain('page=1');
  });

});
