// app/admin/page.tsx
import { Suspense } from 'react';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic'; // don't prerender
export const revalidate = 0;            // no caching

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <AdminClient />
    </Suspense>
  );
}
