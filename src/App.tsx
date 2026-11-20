import { useEffect, useState, type FormEvent } from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import { EXPENSE, INCOME, type Kind } from './kinds';
import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
  type MoneyRecord,
  type RecordFilters,
  type RecordInput,
  type RecordList,
  type SortField,
} from './recordApi';

const initialFilters: RecordFilters = {
  page: 1,
  per_page: 8,
  q: '',
  category: '',
  from: '',
  to: '',
  sort_by: 'received_on',
  sort_order: 'desc',
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatMoney(cents: number) {
  return money.format(cents / 100);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function amountToCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function categoryClass(category: string) {
  return `category category-${category.toLowerCase()}`;
}

function RecordForm({
  kind,
  record,
  onClose,
  onSave,
}: {
  kind: Kind;
  record: MoneyRecord | null;
  onClose: () => void;
  onSave: (input: RecordInput) => Promise<void>;
}) {
  const [source, setSource] = useState(record?.source ?? '');
  const [amount, setAmount] = useState(
    record ? (record.amount_cents / 100).toFixed(2) : '',
  );
  const [category, setCategory] = useState(record?.category ?? kind.categories[0]);
  const [receivedOn, setReceivedOn] = useState(record?.received_on ?? today());
  const [description, setDescription] = useState(record?.description ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = amountToCents(amount);
    if (amountCents === null) {
      setError('Enter an amount greater than zero with up to two decimal places.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        amount_cents: amountCents,
        source: source.trim(),
        category,
        description: description.trim() || null,
        received_on: receivedOn,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : `Could not save this ${kind.noun}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        aria-labelledby={`${kind.name}-dialog-title`}
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{record ? 'UPDATE RECORD' : 'NEW RECORD'}</p>
            <h2 id={`${kind.name}-dialog-title`}>{record ? `Edit ${kind.noun}` : `Add ${kind.noun}`}</h2>
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <form className="income-form" onSubmit={submit}>
          <label>
            Source
            <input
              autoFocus
              maxLength={120}
              onChange={(event) => setSource(event.target.value)}
              placeholder={kind.sourcePlaceholder}
              required
              value={source}
            />
          </label>
          <div className="form-row">
            <label>
              Amount <span className="field-note">USD</span>
              <input
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
                value={amount}
              />
            </label>
            <label>
              Category
              <select onChange={(event) => setCategory(event.target.value)} value={category}>
                {kind.categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <label>
            {kind.dateLabel}
            <input
              onChange={(event) => setReceivedOn(event.target.value)}
              required
              type="date"
              value={receivedOn}
            />
          </label>
          <label>
            Note <span className="field-note">OPTIONAL</span>
            <textarea
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={`Add a note about this ${kind.noun}`}
              rows={3}
              value={description}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="button button-quiet" onClick={onClose} type="button">Cancel</button>
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? 'Saving…' : record ? 'Save changes' : `Add ${kind.noun}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RecordsPage({ kind }: { kind: Kind }) {
  const [filters, setFilters] = useState(initialFilters);
  const [searchText, setSearchText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [result, setResult] = useState<RecordList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MoneyRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters((current) => current.q === searchText
        ? current
        : { ...current, q: searchText, page: 1 });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listRecords(kind.apiPath, filters, controller.signal)
      .then((response) => {
        setResult(response);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : `Could not load ${kind.noun} records.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, filters, refresh]);

  function changeFilter<Key extends keyof RecordFilters>(key: Key, value: RecordFilters[Key]) {
    setFilters((current) => {
      if (key === 'page') {
        return { ...current, page: Number(value) };
      }

      return { ...current, [key]: value, page: 1 };
    });
  }

  function changeSort(field: SortField) {
    setFilters((current) => ({
      ...current,
      sort_by: field,
      sort_order: current.sort_by === field && current.sort_order === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  }

  async function saveRecord(input: RecordInput) {
    setBusy(true);
    try {
      if (editing) await updateRecord(kind.apiPath, editing.id, input);
      else await createRecord(kind.apiPath, input);
      setEditing(null);
      setAdding(false);
      setRefresh((current) => current + 1);
    } finally {
      setBusy(false);
    }
  }

  async function removeRecord(record: MoneyRecord) {
    if (!window.confirm(`Delete the ${kind.noun} from "${record.source}"? This cannot be undone.`)) return;
    setBusy(true);
    setDeleteError('');
    try {
      await deleteRecord(kind.apiPath, record.id);
      if (result?.data.length === 1 && filters.page > 1) {
        setFilters((current) => ({ ...current, page: current.page - 1 }));
      } else {
        setRefresh((current) => current + 1);
      }
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : `Could not delete this ${kind.noun}.`);
    } finally {
      setBusy(false);
    }
  }

  const page = result?.pagination.page ?? filters.page;
  const totalPages = result?.pagination.total_pages ?? 0;
  const totalItems = result?.pagination.total_items ?? 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a aria-label="Finance Management home" className="brand" href="/">
          <span className="brand-mark">f.</span>
          <span className="brand-name">fin<span>well</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="side-nav">
          <span aria-disabled="true" className="nav-item nav-item-muted"><span className="nav-icon">◫</span>Overview</span>
          <Link aria-current={kind === INCOME ? 'page' : undefined} className={`nav-item${kind === INCOME ? ' nav-item-active' : ''}`} to={INCOME.route}><span className="nav-icon">↗</span>Income</Link>
          <Link aria-current={kind === EXPENSE ? 'page' : undefined} className={`nav-item${kind === EXPENSE ? ' nav-item-active' : ''}`} to={EXPENSE.route}><span className="nav-icon">↘</span>Expenses</Link>
          <span aria-disabled="true" className="nav-item nav-item-muted"><span className="nav-icon">▤</span>Reports</span>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-spark">✳</span>
            <strong>Small steps add up.</strong>
            <span>Keep your money story in one place.</span>
          </div>
          <div className="profile">
            <span className="avatar">Y</span>
            <span><strong>Your workspace</strong><small>Personal account</small></span>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{kind.title}</strong></div>
          <div className="topbar-right">
            <span aria-label="Profile" className="avatar avatar-small">Y</span>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">YOUR MONEY, IN FOCUS</p>
              <h1>{kind.title} <span className="title-dot">.</span></h1>
              <p className="page-subtitle">{kind.subtitle}</p>
            </div>
            <button className="button button-primary add-button" onClick={() => setAdding(true)} type="button">
              <span className="plus">+</span> Add {kind.noun}
            </button>
          </section>

          <section aria-label={`${kind.title} summary`} className="summary-grid">
            <article className="summary-card summary-main">
              <div className="summary-label">TOTAL {kind.title.toUpperCase()} <span className="summary-icon">↗</span></div>
              <div className="summary-value">{loading && !result ? '—' : formatMoney(result?.total_amount_cents ?? 0)}</div>
              <div className="summary-foot"><span className="summary-accent">↗</span> Across your filtered records</div>
              <div aria-hidden="true" className="summary-decoration"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            </article>
            <article className="summary-card">
              <div className="summary-label">RECORDS FOUND <span className="summary-icon summary-icon-soft">▦</span></div>
              <div className="summary-value summary-value-dark">{loading && !result ? '—' : totalItems}</div>
              <div className="summary-foot">Matching your current filters</div>
            </article>
            <article className="summary-card">
              <div className="summary-label">AVERAGE ENTRY <span className="summary-icon summary-icon-soft">◷</span></div>
              <div className="summary-value summary-value-dark">{loading && !result ? '—' : formatMoney(totalItems ? Math.round((result?.total_amount_cents ?? 0) / totalItems) : 0)}</div>
              <div className="summary-foot">Average across matching records</div>
            </article>
          </section>

          <section aria-label={`${kind.title} transactions`} className="transactions-panel" id={kind.name}>
            <div className="panel-heading">
              <div>
                <h2>{kind.title} records</h2>
                <p>{kind.panelText}</p>
              </div>
              <span className="record-count">{totalItems} {totalItems === 1 ? 'record' : 'records'}</span>
            </div>

            <div className="toolbar">
              <label className="search-box">
                <span aria-hidden="true" className="search-icon">⌕</span>
                <input
                  aria-label={`Search ${kind.noun}`}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder={`Search ${kind.noun}...`}
                  value={searchText}
                />
              </label>
              <label className="filter-control">
                <span className="filter-label">Category</span>
                <select aria-label="Filter by category" onChange={(event) => changeFilter('category', event.target.value)} value={filters.category}>
                  <option value="">All categories</option>
                  {kind.categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="filter-control date-filter">
                <span className="filter-label">From</span>
                <input aria-label="Start date" onChange={(event) => changeFilter('from', event.target.value)} type="date" value={filters.from} />
              </label>
              <label className="filter-control date-filter">
                <span className="filter-label">To</span>
                <input aria-label="End date" onChange={(event) => changeFilter('to', event.target.value)} type="date" value={filters.to} />
              </label>
              <button
                aria-label="Toggle sort order"
                className="sort-toggle"
                onClick={() => changeFilter('sort_order', filters.sort_order === 'desc' ? 'asc' : 'desc')}
                type="button"
              >
                {filters.sort_order === 'desc' ? '↓' : '↑'} Sort
              </button>
            </div>

            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}

            <div aria-live="polite" className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><button onClick={() => changeSort('source')} type="button">SOURCE <span>↕</span></button></th>
                    <th><button onClick={() => changeSort('category')} type="button">CATEGORY <span>↕</span></button></th>
                    <th><button onClick={() => changeSort('received_on')} type="button">DATE <span>↕</span></button></th>
                    <th className="amount-heading"><button onClick={() => changeSort('amount')} type="button">AMOUNT <span>↕</span></button></th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !result && Array.from({ length: 4 }, (_, index) => (
                    <tr className="skeleton-row" key={`skeleton-${index}`}>
                      <td colSpan={5}><span /></td>
                    </tr>
                  ))}
                  {result?.data.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div className="source-cell">
                          <span className={`source-avatar source-${record.category.toLowerCase()}`}>{record.source.trim().charAt(0).toUpperCase()}</span>
                          <span><strong>{record.source}</strong><small>{record.description || kind.defaultNote}</small></span>
                        </div>
                      </td>
                      <td><span className={categoryClass(record.category)}><i />{record.category}</span></td>
                      <td className="date-cell">{formatDate(record.received_on)}</td>
                      <td className={`amount-cell amount-${kind.name}`}>{kind.sign}{formatMoney(record.amount_cents)}</td>
                      <td>
                        <div className="row-actions">
                          <button aria-label={`Edit ${record.source}`} className="row-action" disabled={busy} onClick={() => setEditing(record)} type="button">Edit</button>
                          <button aria-label={`Delete ${record.source}`} className="row-action row-action-delete" disabled={busy} onClick={() => void removeRecord(record)} type="button">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && result?.data.length === 0 && (
                    <tr><td className="empty-cell" colSpan={5}>
                      <span className="empty-icon">↗</span>
                      <strong>{filters.q || filters.category || filters.from || filters.to ? `No matching ${kind.noun}` : kind.emptyTitle}</strong>
                      <span>{filters.q || filters.category || filters.from || filters.to ? 'Try adjusting your filters.' : kind.emptyText}</span>
                      {!filters.q && !filters.category && !filters.from && !filters.to && (
                        <button className="button button-primary empty-add" onClick={() => setAdding(true)} type="button">Add your first {kind.noun}</button>
                      )}
                    </td></tr>
                  )}
                  {error && (
                    <tr><td className="empty-cell error-cell" colSpan={5}>
                      <strong>We couldn’t load your {kind.noun}</strong><span>{error}</span>
                      <button className="button button-quiet" onClick={() => setRefresh((current) => current + 1)} type="button">Try again</button>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>Showing <strong>{totalItems === 0 ? 0 : (page - 1) * filters.per_page + 1}–{Math.min(page * filters.per_page, totalItems)}</strong> of <strong>{totalItems}</strong></span>
              <div className="pagination">
                <button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => changeFilter('page', page - 1)} type="button">←</button>
                <span>Page <strong>{page}</strong> of <strong>{Math.max(totalPages, 1)}</strong></span>
                <button aria-label="Next page" disabled={page >= totalPages || loading} onClick={() => changeFilter('page', page + 1)} type="button">→</button>
              </div>
            </footer>
          </section>
          <p className="page-footnote">All amounts are shown in USD.</p>
        </div>
      </main>

      {(adding || editing) && (
        <RecordForm
          kind={kind}
          record={editing}
          onClose={() => {
            if (!busy) {
              setAdding(false);
              setEditing(null);
            }
          }}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* `key` resets all page state when switching between income and expenses. */}
      <Route path={INCOME.route} element={<RecordsPage key={INCOME.name} kind={INCOME} />} />
      <Route path={EXPENSE.route} element={<RecordsPage key={EXPENSE.name} kind={EXPENSE} />} />
    </Routes>
  );
}
