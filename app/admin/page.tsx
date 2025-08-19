// app/admin/page.tsx
import NextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

// Load the client UI only in the browser
const AdminClient = NextDynamic(() => import('./AdminClient'), { ssr: false });

export default function AdminPage() {
  return <AdminClient />;
}
