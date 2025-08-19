// app/admin/page.tsx
import NextDynamic from 'next/dynamic';

// Make this page always dynamic (no prerender/cache)
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Load the client-only admin UI without SSR
const AdminClient = NextDynamic(() => import('./AdminClient'), { ssr: false });

export default function Page() {
  return <AdminClient />;
}
