/** Everything that differs between the income and expense pages. */
export interface Kind {
  name: 'income' | 'expense';
  /** Browser route of the page. */
  route: string;
  /** Backend endpoint. */
  apiPath: string;
  categories: readonly string[];
  /** Singular, lowercase: "income". */
  noun: string;
  /** Plural, capitalised: "Income" / "Expenses". */
  title: string;
  /** "+" or "−" shown before each amount. */
  sign: string;
  subtitle: string;
  panelText: string;
  dateLabel: string;
  sourcePlaceholder: string;
  defaultNote: string;
  emptyTitle: string;
  emptyText: string;
}

export const INCOME: Kind = {
  name: 'income',
  route: '/',
  apiPath: '/api/incomes',
  categories: ['Salary', 'Freelance', 'Investments', 'Business', 'Other'],
  noun: 'income',
  title: 'Income',
  sign: '+',
  subtitle: 'A clear view of everything you earn.',
  panelText: 'Keep track of every dollar coming in.',
  dateLabel: 'Received on',
  sourcePlaceholder: 'e.g. Monthly salary',
  defaultNote: 'Income received',
  emptyTitle: 'Your income story starts here',
  emptyText: 'Add your first income record to see it here.',
};

export const EXPENSE: Kind = {
  name: 'expense',
  route: '/expenses',
  apiPath: '/api/expenses',
  categories: ['Rent', 'Food', 'Transport', 'Utilities', 'Health', 'Other'],
  noun: 'expense',
  title: 'Expenses',
  sign: '−',
  subtitle: 'A clear view of everything you spend.',
  panelText: 'Keep track of every dollar going out.',
  dateLabel: 'Spent on',
  sourcePlaceholder: 'e.g. Weekly groceries',
  defaultNote: 'Expense recorded',
  emptyTitle: 'No expenses recorded yet',
  emptyText: 'Add your first expense to see it here.',
};
