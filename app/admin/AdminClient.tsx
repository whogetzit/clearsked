'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Row = {
  phone: string; active: boolean; zip: string;
  latitude?: number; longitude?: number; durationMin?: number;
  timeZone?: string; deliveryHourLocal?: number | string;
  createdAt?: string; lastSentAt?: string;
  tempMin?: number; tempMax?: number; windMax?: number; uvMax?: number; aqiMax?: number;
  humidityMax?: number; precipMax?: number; cloudMax?: number;
};

function rowsToCsv(rows: Row[]) {
  const headers = [
    'phone','active','zip','latitude','longitude','durationMin',
    'timeZone','deliveryHourLocal','createdAt','lastSentAt',
    'tempMin','tempMax','windMax','uvMax','aqiMax','humidityMax','precipMax','cloudMax'
  ];
  const esc = (v: any) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))].join('\n');
}

export default function AdminClient() {
  const sp = useSearchParams();
  const tokenFromUrl = sp.get('token') ?? '';

  const [token, setToken] = useState('');
  const [limit, setLimit] = useState('50');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const remembered = typeof window !== 'undefined' ? localStorage.getItem('admin_token') ?? '' : '';
    const initial = tokenFromUrl || remembered;
    if (initial) {
      setToken(initial);
      try { localStorage.setItem('admin_token', initial); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  async function loadSubs() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ limit });
      if (token) qs.set('token', token); // query path

      const headers: HeadersInit = {};
      if (token) headers['x-admin-token'] = token; // header path

      const res = await fetch(`/api/admin/subscribers?${qs.toString()}`, {
        headers,
        cache: 'no-store',
        credentials: 'same-origin', // send cookie if you used /admin/login
      });

      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(e?.message || 'load failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function exportCsvClient() {
    if (!rows.length) return;
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clearsked-subscribers-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const serverCsvHref = useMemo(() => {
    const base = '/api/admin/export?mask=1';
    return token ? `${base}&token=${encodeURIComponent(token)}` : base;
  }, [token]);

  return (
    <main style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ margin: 0 }}>Admin — Subscribers</h1>
      <p style={{ color: '#475569' }}>View and export website submissions.</p>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Admin token</span>
          <input
            value={token}
            onChange={(e) => { setToken(e.target.value); try { localStorage.setItem('admin_token', e.target.value); } catch {} }}
            placeholder="paste ?token= value or leave empty if you used /admin/login"
            style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Limit</span>
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="50"
            style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, maxWidth: 140 }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={loadSubs}
            disabled={loading}
            style={{ padding: '10px 14px', borderRadius: 8, background: '#0f172a', color: 'white', border: 0 }}
          >
            {loading ? 'Loading…' : 'Load submissions'}
          </button>

          <button
            onClick={exportCsvClient}
            disabled={!rows.length}
            style={{ padding: '10px 14px', borderRadius: 8, background: '#e2e8f0', border: 0 }}
          >
            Export CSV (current)
          </button>

          <a
            href={serverCsvHref}
            style={{ padding: '10px 14px', borderRadius: 8, background: '#e2e8f0', textDecoration: 'none', color: '#0f172a' }}
          >
            Export CSV (server)
          </a>
        </div>

        {err && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8 }}>
            {JSON.stringify({ ok: false, error: err })}
          </div>
        )}

        {!err && rows.length > 0 && (
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {[
                    'phone','active','zip','durationMin','timeZone','deliveryHourLocal',
                    'createdAt','lastSentAt','tempMin','tempMax','windMax','uvMax','aqiMax',
                    'humidityMax','precipMax','cloudMax'
                  ].map((h) => (
                    <th
                      key={h}
                      style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.phone}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{String(r.active)}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.zip}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.durationMin ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.timeZone ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.deliveryHourLocal ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.createdAt ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.lastSentAt ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.tempMin ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.tempMax ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.windMax ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.uvMax ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.aqiMax ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.humidityMax ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.precipMax ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.cloudMax ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer style={{ marginTop: 48, color: '#64748b' }}>
        © {new Date().getFullYear()} ClearSked · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}
