// app/admin/page.tsx
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

// Load the client-only UI without SSR to avoid bailouts
const AdminClient = nextDynamic(() => import('./AdminClient'), { ssr: false });

export default function AdminPage() {
  return <AdminClient />;
}
