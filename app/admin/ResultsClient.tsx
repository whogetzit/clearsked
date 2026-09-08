// app/admin/ResultsClient.tsx (client component)
'use client';

export default function ResultsClient({ results }: { results: unknown[] }) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-4">Daily Send Results</h3>
      <p className="text-sm text-slate-600 mb-4">
        Total records: {Array.isArray(results) ? results.length : 0}
      </p>
      {Array.isArray(results) && results.length > 0 && (
        <pre className="bg-slate-100 p-4 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(results, null, 2)}
        </pre>
      )}
    </div>
  );
}
