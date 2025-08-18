// app/admin/AdminClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Row = {
  phone: string;
  active: boolean;
  zip: string;
  latitude?: number;
  longitude?: number;
  durationMin?: number;
  timeZone?: string;
  deliveryHourLocal?: number;
  createdAt?: string;
  lastSentAt?: string | null;
  tempMin?: number | null;
  tempMax?: number | null;
  windMax?: number | null;
  uvMax?: number | null;
  aqiMax?: number | null;
  humidityMax?: number | null;
  precipMax?: number | null;
  cloudMax?: number | null;
};

function setCookie(name: string, value: string, days = 30) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}

function getCookie(name: string) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop() as string) : null;
}

export default function AdminClient() {
  const sp = useSearchParams();
  const initialFromQS = sp.get('token') || '';
  const [token, setToken] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);

  // Subscribers
  const [subs, setSubs] = useState<Row[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Diagnostics
  const [diag, setDiag] = useState<any | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Force send
  const [forcePhone, setForcePhone] = useState('');
  const [forceMode, setForceMode] = useState<'preview' | 'send'>('preview');
  const [forceBusy, setForceBusy] = useState(false);
  const [forceResult, setForceResult] = useState<any | null>(null);

  // CSV export (server)
  const exportCsvHref = useMemo(() => {
    const u = new URL('/api/admin/export.csv', window.location.origin);
    if (token) u.searchParams.set('token', token);
    return u.toString();
  }, [token]);

  // Init token: from query, or cookie, or localStorage
  useEffect(() => {
    const qs = initialFromQS.trim();
    const cookieTok = getCookie('admin_token') || '';
    const ls = (typeof window !== 'undefined' && window.localStorage.getItem('admin_token')) || '';
    const chosen = qs || cookieTok || ls || '';
    if (chosen) {
      setToken(chosen);
      // persist (so subsequent fetches can also use cookie fallback server-side if needed)
      setCookie('admin_token', chosen);
      try { window.localStorage.setItem('admin_token', chosen); } catch {}
    }
  }, [initialFromQS]);

  function saveToken() {
    if (!token) { setMsg('Enter a token'); return; }
    setCookie('admin_token', token);
    try { window.localStorage.setItem('admin_token', token); } catch {}
    setMsg('Token saved to cookie and localStorage');
  }

  async function loadSubs(limit = 50) {
    if (!token) { setMsg('Unauthorized: set admin token'); return; }
    setLoadingSubs(true);
    setMsg(null);
    try {
      const u = new URL('/api/admin/subscribers', window.location.origin);
      u.searchParams.set('limit', String(limit));
      // You can rely on cookie auth, but also pass the header to be explicit:
      const r = await fetch(u.toString(), {
        headers: { 'x-admin-token': token },
        cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setSubs(j.rows || []);
    } catch (e: any) {
      setMsg(e?.message || 'Load failed');
      setSubs([]);
    } finally {
      setLoadingSubs(false);
    }
  }

  async function runDiag() {
    if (!token) { setMsg('Unauthorized: set admin token'); return; }
    setDiagLoading(true);
    setDiag(null);
    setMsg(null);
    try {
      const u = new URL('/api/diag', window.location.origin);
      const r = await fetch(u.toString(), {
        headers: { 'x-admin-token': token },
        cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setDiag(j);
    } catch (e: any) {
      setMsg(e?.message || 'Diag failed');
      setDiag(null);
    } finally {
      setDiagLoading(false);
    }
  }

  function encodePhoneParam(raw: string) {
    const s = raw.trim();
    // Accept +E.164 or 10-digit US
    if (/^\+1\d{10}$/.test(s)) return s;
    const digits = s.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    return s; // let API validate
  }

  async function forceSend() {
    if (!token) { setMsg('Unauthorized: set admin token'); return; }
    setForceBusy(true);
    setForceResult(null);
    setMsg(null);
    try {
      const phoneParam = forcePhone ? encodePhoneParam(forcePhone) : '';
      const u = new URL('/api/cron/send-daily', window.location.origin);
      if (forceMode === 'send') u.searchParams.set('send', '1');
      if (phoneParam) u.searchParams.set('phone', phoneParam);
      const r = await fetch(u.toString(), {
        headers: { 'x-admin-token': token },
        cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setForceResult(j);
    } catch (e: any) {
      setMsg(e?.message || 'Force send failed');
      setForceResult(null);
    } finally {
      setForceBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <p style={{ color: '#475569' }}>Authenticated admin tools for ClearSked.</p>

      {/* Token/Login */}
      <section style={{ marginTop: 18, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Admin Token</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="password"
            placeholder="Paste ADMIN_TOKEN"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
          />
          <button onClick={saveToken} style={{ padding: '10px 14px', borderRadius: 8, background: '#0f172a', color: '#fff', border: 0 }}>
            Save Token
          </button>
        </div>
      </section>

      {/* Subscribers */}
      <section style={{ marginTop: 18, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Subscribers</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => loadSubs(50)}
            disabled={loadingSubs}
            style={{ padding: '10px 14px', borderRadius: 8, background: '#111827', color: '#fff', border: 0 }}
          >
            {loadingSubs ? 'Loading…' : 'Load Submissions'}
          </button>

        <a
          href={exportCsvHref}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#e5e7eb', color: '#111827', textDecoration: 'none' }}
          title="Exports on the server (uses token in query)"
        >
          Export CSV (server)
        </a>
        </div>

        {subs.length > 0 && (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Phone', 'Active', 'ZIP', 'Dur', 'TZ', 'Hr', 'Created', 'Last Sent'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subs.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.phone}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.active ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.zip}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.durationMin ?? ''}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.timeZone ?? ''}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.deliveryHourLocal ?? ''}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.createdAt ?? ''}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f1f5f9' }}>{r.lastSentAt ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* NEW: Diagnostics */}
      <section style={{ marginTop: 18, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Diagnostics</h2>
        <p style={{ color: '#475569', marginTop: 0 }}>Runs <code>/api/diag</code> using your admin token.</p>
        <button
          onClick={runDiag}
          disabled={diagLoading}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#1f2937', color: '#fff', border: 0 }}
        >
          {diagLoading ? 'Running…' : 'Run Diagnostics'}
        </button>

        {diag && (
          <div style={{ marginTop: 12 }}>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
{JSON.stringify(diag, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* NEW: Force Send */}
      <section style={{ marginTop: 18, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Force Send Daily Text</h2>
        <p style={{ color: '#475569', marginTop: 0 }}>
          Call <code>/api/cron/send-daily</code> right now. Leave phone empty to target everyone whose local hour equals their delivery hour.
          Enter a phone (E.164 or US 10-digit) to send/preview just that number.
        </p>

        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Phone (optional)</span>
            <input
              value={forcePhone}
              onChange={(e) => setForcePhone(e.target.value)}
              placeholder="+13095551234 or 3095551234"
              style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
            />
          </label>

          <label style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>Mode:</span>
            <select
              value={forceMode}
              onChange={(e) => setForceMode(e.target.value as 'preview' | 'send')}
              style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }}
            >
              <option value="preview">Preview (dry run)</option>
              <option value="send">Send now</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={forceSend}
              disabled={forceBusy}
              style={{ padding: '10px 14px', borderRadius: 8, background: '#0f172a', color: '#fff', border: 0 }}
            >
              {forceBusy ? 'Working…' : (forceMode === 'send' ? 'Send Now' : 'Preview')}
            </button>
          </div>
        </div>

        {forceResult && (
          <div style={{ marginTop: 12 }}>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
{JSON.stringify(forceResult, null, 2)}
            </pre>

            {/* Show MMS chart previews if present */}
            {Array.isArray(forceResult.details) && forceResult.details.length > 0 && (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {forceResult.details.map((d: any, i: number) => (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{d.phone || '(unknown)'} — Score {d.bestScore ?? '–'}</div>
                    <div style={{ color: '#475569', fontSize: 14 }}>
                      {d.startLocal && d.endLocal ? `${d.startLocal}–${d.endLocal}` : ''}
                      {d.dawnLocal && d.duskLocal ? ` · Dawn ${d.dawnLocal} / Dusk ${d.duskLocal}` : ''}
                    </div>
                    {d.chartUrl && (
                      <div style={{ marginTop: 8 }}>
                        <img src={d.chartUrl} alt="Chart preview" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      </div>
                    )}
                    {d.smsPreview && (
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', marginTop: 8 }}>
{d.smsPreview}
                      </pre>
                    )}
                    {d.error && <div style={{ color: '#b91c1c', marginTop: 6 }}>Error: {d.error}</div>}
                    {d.skipped && <div style={{ color: '#6b7280', marginTop: 6 }}>Note: {d.skipped}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {msg && <div style={{ marginTop: 14, color: msg.startsWith('Unauthorized') ? '#b91c1c' : '#065f46' }}>{msg}</div>}
    </main>
  );
}
