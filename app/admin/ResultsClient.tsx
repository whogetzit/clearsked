// app/admin/ResultsClient.tsx (client component)
'use client';
import DownloadCsvButton from '@/components/DownloadCsvButton';

export default function ResultsClient({ results }: { results: unknown[] }) {
  return (
    <div className="flex items-center gap-3">
      <DownloadCsvButton
        data={results}
        filename={`send-daily-results-${new Date().toISOString().slice(0,10)}.csv`}
      />
    </div>
  );
}
