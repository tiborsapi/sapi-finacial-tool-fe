import { Routes, Route } from 'react-router-dom';

function DashboardPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Finance Management</h1>
      <p>Welcome to the personal finance dashboard.</p>
      <ul>
        <li>Income tracking</li>
        <li>Expense tracking</li>
        <li>Invoice management</li>
        <li>Summary overview</li>
      </ul>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
    </Routes>
  );
}
