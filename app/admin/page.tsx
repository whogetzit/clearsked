// app/admin/page.tsx
import { Suspense } from 'react';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading admin…</main>}>
      <AdminClient />
    </Suspense>
  );
}
