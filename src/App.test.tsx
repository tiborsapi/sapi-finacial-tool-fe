import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { Income, IncomeInput, IncomeList } from './incomeApi';

const fetchMock = vi.fn<typeof fetch>();
let incomes: Income[];

function incomeList(data = incomes): IncomeList {
  return {
    data,
    pagination: {
      page: 1,
      per_page: 8,
      total_items: data.length,
      total_pages: data.length ? 1 : 0,
    },
    total_amount_cents: data.reduce((sum, income) => sum + income.amount_cents, 0),
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
      return response(incomeList());
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
});
