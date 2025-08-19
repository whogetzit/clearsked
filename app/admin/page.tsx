// app/admin/page.tsx (server component)
import ResultsClient from './ResultsClient';

export default async function AdminPage() {
  // Pull your results how you already do (DB or internal API)
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/cron/send-daily`, { cache: 'no-store' });
  const json = await res.json();
  const results = json?.results ?? [];

  return (
    <main className="p-6">
      {/* ... your admin table/summary ... */}
      <ResultsClient results={results} />
    </main>
  );
}
