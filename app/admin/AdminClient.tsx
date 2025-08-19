// app/admin/AdminClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

type SubsRow = {
  phone?: string;
  phoneE164?: string;
  active?: boolean;
  zip?: string;
  latitude?: number | null;
  longitude?: number | null;
  durationMin?: number | null;
  timeZone?: string | null;
  deliveryHourLocal?: number | null;
  createdAt?: string | Date | null;
  lastSentAt?: string | Date | null;
  [k: string]: any;
};

// ---- Safe cookie helpers (no regex pitfalls) ----
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = name + '=';
  return document.cookie
    .split(';')
    .map((s) => s.trim())
    .reduce<string | null>((acc, row) => {
      if (acc) return acc;
      if (row.startsWith(target)) return decodeURIComponent(row.slice(target.length));
      return null;
    }, null);
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 24 * 60 * 60;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

export default function AdminClient() {
  const [token, setToken] = useState('');
  const [limit, setLimit] = useState(50);
  const [mask, setMask] = useState(true);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<any>(null);
  const [rows, setRows] = useState<SubsRow[] | null>(null);

  useEffect(() => {
    const t = getCookie('admin_token');
    if (t) setToken(t);
  }, []);

  const headers = useMemo(() => (token ? { 'x-admin-token': token } : {}), [token]);

  function show(output: any) {
    setLog(output);
  }

  function saveToken() {
    if (!token) return;
    setCookie('admin_token', token, 365);
    alert('Saved admin token to cookie.');
  }

  // --------- Actions ----------
  async function loadSubs() {
    setBusy(true);
    setRows(null);
    try {
      if (!token) throw new Error('No admin token set');
      const qs = new URLSearchParams({
        limit: String(Math.max(1, Math.min(500, limit || 50))),
        mask: mask ? '1' : '0',
      });
      const res = await fetch(`/api/admin/subscribers?${qs.toString()}`, { headers, cache: 'no-store' });
      const json = await res.json();
      show(json);
      if (json.ok && Array.isArray(json.rows)) setRows(json.rows);
    } catch (e: any) {
      show({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!token) {
      alert('Set token first');
      return;
    }
    const url = `/api/admin/export?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  }

  async function forceSend(dry = true) {
    setBusy(true);
    try {
      if (!token) throw new Error('No admin token set');
      const qs = new URLSearchParams();
      qs.set('force', '1');
      if (dry) qs.set('dry', '1');
      if (phone.trim()) qs.set('phone', phone.trim());
      // pass token in both query (easy to inspect) and header (server accepts either)
      qs.set('token', token);

      const res = await fetch(`/api/cron/send-daily?${qs.toString()}`, {
        headers,
        cache: 'no-store',
      });
      const json = await res.json();
      show(json);
    } catch (e: any) {
      show({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  // --------- UI ----------
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <p style={{ color: '#475569', marginTop: 4 }}>
        View/export subscribers and trigger the daily sender. Results show below.
      </p>

      <section style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {/* Token row */}
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 8, alignItems: 'center' }}>
          <label htmlFor="token">Admin token</label>
          <input
            id="token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste ADMIN_TOKEN here"
            style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }}
          />
          <button
            onClick={saveToken}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #94a3b8', background: '#e2e8f0' }}
          >
            Save
          </button>
        </div>

        {/* Subscribers controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, auto)', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Subscribers</span>
          <label>
            Limit
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value || '50', 10))}
              style={{ marginLeft: 6, width: 90, padding: 6, border: '1px solid #cbd5e1', borderRadius: 8 }}
            />
          </label>
          <label>
            <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Mask phones
          </label>
          <button
            onClick={loadSubs}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff' }}
          >
            Load
          </button>
          <button
            onClick={exportCsv}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #94a3b8', background: '#e2e8f0' }}
          >
            Export CSV (server)
          </button>
        </div>

        {/* Force send controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Force send</span>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="optional E.164 phone to target one user"
            style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }}
          />
          <button
            onClick={() => forceSend(true)}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #94a3b8', background: '#e2e8f0' }}
          >
            Dry-run
          </button>
          <button
            onClick={() => forceSend(false)}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 8, background: '#047857', color: '#fff' }}
          >
            Send now
          </button>
        </div>
      </section>

      {/* Console output */}
      <section style={{ marginTop: 16 }}>
        <h3 style={{ margin: '8px 0' }}>Console</h3>
        <div
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 12,
            background: '#0b1020',
            color: '#e5e7eb',
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            maxHeight: 420,
            overflow: 'auto',
          }}
        >
          {busy && <div style={{ marginBottom: 8 }}>Loading…</div>}
          <pre style={{ margin: 0 }}>{JSON.stringify(log ?? { hint: 'Run a command above' }, null, 2)}</pre>
        </div>
      </section>

      {/* Quick table preview */}
      {rows && rows.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3 style={{ margin: '8px 0' }}>Rows ({rows.length})</h3>
          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {Object.keys(rows[0]).slice(0, 12).map((k) => (
                    <th
                      key={k}
                      style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {Object.keys(rows[0])
                      .slice(0, 12)
                      .map((k) => (
                        <td key={k} style={{ padding: '8px 10px' }}>
                          {String((r as any)[k] ?? '')}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
