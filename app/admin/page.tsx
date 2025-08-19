import dynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const AdminClient = dynamic(() => import('./AdminClient'), { ssr: false });

export default function Page() {
  return <AdminClient />;
}
