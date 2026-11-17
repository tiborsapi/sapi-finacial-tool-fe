import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { Income, IncomeInput, IncomeList } from './incomeApi';

const fetchMock = vi.fn<typeof fetch>();
let incomes: Income[];

function incomeList(
  data = incomes,
  page = 1,
  perPage = 8,
  totalItems = data.length,
  totalAmountCents = data.reduce((sum, income) => sum + income.amount_cents, 0),
): IncomeList {
  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total_items: totalItems,
      total_pages: Math.ceil(totalItems / perPage),
    },
    total_amount_cents: totalAmountCents,
  };
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  incomes = [];
  fetchMock.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') {
      const inputData = JSON.parse(String(init.body)) as IncomeInput;
      const created: Income = {
        ...inputData,
        id: 'income-1',
        created_at: '2026-05-01T10:00:00Z',
        updated_at: '2026-05-01T10:00:00Z',
      };
      incomes = [created];
      return response(created, 201);
    }

    if (init?.method === 'PUT') {
      const inputData = JSON.parse(String(init.body)) as IncomeInput;
      const updated: Income = {
        ...inputData,
        id: 'income-1',
        created_at: '2026-05-01T10:00:00Z',
        updated_at: '2026-05-02T10:00:00Z',
      };
      incomes = [updated];
      return response(updated);
    }

    if (init?.method === 'DELETE') {
      incomes = [];
      return response(undefined, 204);
    }

    if (String(input).startsWith('/api/incomes?')) {
      const url = new URL(String(input), 'http://localhost');
      const params = url.searchParams;
      const page = Number(params.get('page') ?? '1');
      const perPage = Number(params.get('per_page') ?? '8');
      const filtered = incomes
        .filter((income) => !params.get('q') || `${income.source} ${income.description ?? ''}`.toLowerCase().includes(params.get('q')!.toLowerCase()))
        .filter((income) => !params.get('category') || income.category === params.get('category'))
        .filter((income) => !params.get('from') || income.received_on >= params.get('from')!)
        .filter((income) => !params.get('to') || income.received_on <= params.get('to')!);
      const sortBy = params.get('sort_by');
      const sortOrder = params.get('sort_order') === 'asc' ? 1 : -1;
      if (sortBy === 'amount') {
        filtered.sort((left, right) => (left.amount_cents - right.amount_cents) * sortOrder);
      } else if (sortBy === 'source') {
        filtered.sort((left, right) => left.source.localeCompare(right.source) * sortOrder);
      } else {
        filtered.sort((left, right) => left.received_on.localeCompare(right.received_on) * sortOrder);
      }
      const offset = (page - 1) * perPage;
      return response(
        incomeList(
          filtered.slice(offset, offset + perPage),
          page,
          perPage,
          filtered.length,
          filtered.reduce((sum, income) => sum + income.amount_cents, 0),
        ),
      );
    }

    return response({ error: 'Unexpected request' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('Income dashboard', () => {
  it('creates, edits, and deletes income records', async () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>,
    );

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await screen.findByText('Your income story starts here')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add income/ }));

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'Monthly salary' },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: '4200.50' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add income' }));

    expect(await screen.findByText('Monthly salary')).toBeTruthy();
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(createCall?.[0]).toBe('/api/incomes');
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      amount_cents: 420050,
      source: 'Monthly salary',
      category: 'Salary',
      description: null,
      received_on: expect.any(String),
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Monthly salary' }));
    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'New role salary' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('New role salary')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete New role salary' }));
    expect(await screen.findByText('Your income story starts here')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('validates the amount before sending a create request', async () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Add income/ }));
    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'Invalid amount' },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: '1.234' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add income' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Enter an amount greater than zero with up to two decimal places.',
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('filters, sorts, and paginates income records', async () => {
    incomes = Array.from({ length: 9 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      return {
        id: `income-${index + 1}`,
        amount_cents: (index + 1) * 100,
        source: `Income ${day}`,
        category: index % 2 === 0 ? 'Salary' : 'Other',
        description: null,
        received_on: `2026-01-${day}`,
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:00:00Z',
      };
    });

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Income 09')).toBeTruthy();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(8);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Income 01')).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(1));
    await waitFor(() =>
      expect(document.querySelector('.pagination')?.textContent).toContain('Page 2 of 2'),
    );

    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'Salary' },
    });
    expect(await screen.findByText('Income 01')).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(5));
    await waitFor(() =>
      expect(document.querySelector('.pagination')?.textContent).toContain('Page 1 of 1'),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=Salary'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /AMOUNT/ }));
    await waitFor(() => expect(screen.getByText('Income 09')).toBeTruthy());
    expect(document.querySelector('tbody tr')?.textContent).toContain('Income 09');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('sort_by=amount'))).toBe(true);

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-01-03' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-01-05' },
    });
    await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(2));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('from=2026-01-03'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('to=2026-01-05'))).toBe(true);

    fireEvent.change(screen.getByLabelText('Search income'), {
      target: { value: 'Income 03' },
    });
    await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(1));
    expect(document.querySelector('tbody tr')?.textContent).toContain('Income 03');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=Income+03'))).toBe(true);
  });
});
