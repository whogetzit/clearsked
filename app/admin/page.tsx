// app/admin/page.tsx
import { Suspense } from 'react';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <AdminClient />
    </Suspense>
  );
}
