'use client';

import React, { useEffect, useMemo, useState } from 'react';

type SubscriberRow = {
  phone: string;
  active: boolean;
  zip?: string;
  latitude?: number | null;
  longitude?: number | null;
  durationMin?: number | null;
  timeZone?: string | null;
  deliveryHourLocal?: number | null;
  createdAt?: string | Date;
  lastSentAt?: string | Date | null;
};

type SubsResponse = {
  ok: boolean;
  count?: number;
  rows?: SubscriberRow[];
  error?: string;
};

function maskPhoneLocal(phone: string) {
  if (!phone) return '';
  if (phone.startsWith('+1') && phone.length >= 4) {
    return '+1' + '*'.repeat(Math.max(0, phone.length - 4)) + phone.slice(-2);
  }
  return '*'.repeat(Math.max(0, phone.length - 2)) + phone.slice(-2);
}

function setCookie(name: string, value: string, days = 365) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

function getCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : '';
}

function parseTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const u = new URL(window.location.href);
  const t = u.searchParams.get('token');
  return t ? t.trim() : null;
}

function buildUrl(path: string, params: Record<string, string | number | boolean | undefined>, token: string) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined) return;
    url.searchParams.set(k, String(v));
  });
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

async function apiFetchJson(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  token: string
) {
  const url = buildUrl(path, params, token);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-admin-token': token || '',
      'cache-control': 'no-cache',
    },
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default function AdminPage() {
  const [token, setToken] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [authed, setAuthed] = useState<boolean>(false);

  const [limit, setLimit] = useState<number>(50);
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [diagOutput, setDiagOutput] = useState<string>('');

  const [sendPhone, setSendPhone] = useState<string>('');
  const [sendReal, setSendReal] = useState<boolean>(false);

  const [maskInUi, setMaskInUi] = useState<boolean>(true);

  // Bootstrap token: URL ?token= -> cookie -> localStorage
  useEffect(() => {
    const fromUrl = parseTokenFromUrl();
    if (fromUrl) {
      setToken(fromUrl);
      setTokenInput(fromUrl);
      setCookie('admin_token', fromUrl);
      try { localStorage.setItem('admin_token', fromUrl); } catch {}
      setAuthed(true);
      return;
    }
    const fromCookie = getCookie('admin_token');
    if (fromCookie) {
      setToken(fromCookie);
      setTokenInput(fromCookie);
      setAuthed(true);
      return;
    }
    try {
      const fromLs = localStorage.getItem('admin_token') || '';
      if (fromLs) {
        setToken(fromLs);
        setTokenInput(fromLs);
        setCookie('admin_token', fromLs);
        setAuthed(true);
        return;
      }
    } catch {}
  }, []);

  const onLogin = () => {
    const t = tokenInput.trim();
    if (!t) {
      alert('Enter an admin token.');
      return;
    }
    setToken(t);
    setCookie('admin_token', t);
    try { localStorage.setItem('admin_token', t); } catch {}
    setAuthed(true);
  };

  const onLogout = () => {
    setToken('');
    setTokenInput('');
    setAuthed(false);
    setRows([]);
    setDiagOutput('');
    document.cookie = `admin_token=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    try { localStorage.removeItem('admin_token'); } catch {}
  };

  async function loadSubscribers() {
    if (!token) return alert('No admin token in this session');
    setLoading(true);
    setRows([]);
    setDiagOutput('');
    const { ok, json, status } = await apiFetchJson('/api/admin/subscribers', { limit, mask: 0 }, token);
    setLoading(false);
    if (!ok) {
      console.error('loadSubscribers', status, json);
      return alert(`Load failed: ${json?.error || status}`);
    }
    const data = json as SubsResponse;
    setRows(data.rows || []);
  }

  function exportCsvServer() {
    if (!token) return alert('No admin token in this session');
    const url = buildUrl('/api/admin/subscribers.csv', { limit, mask: maskInUi ? 1 : 0 }, token);
    window.location.href = url; // triggers download
  }

  async function runDiag() {
    if (!token) return alert('No admin token in this session');
    setDiagOutput('Running /api/diag ...');
    const { ok, json, status } = await apiFetchJson('/api/diag', {}, token);
    if (!ok) return setDiagOutput(`Diag failed (${status}): ${JSON.stringify(json, null, 2)}`);
    setDiagOutput(JSON.stringify(json, null, 2));
  }

  async function forceSend(phone: string) {
    if (!token) return alert('No admin token in this session');
    if (!phone) return alert('Enter a phone number in E.164, e.g. +13095551234');

    const params = { phone, bypassHour: 1, send: sendReal ? 1 : undefined };
    const { ok, json, status } = await apiFetchJson('/api/cron/send-daily', params, token);
    if (!ok) {
      console.error('forceSend', status, json);
      return alert(`Force send failed: ${json?.error || status}`);
    }
    alert('Force send OK. See response in console.');
    console.log('forceSend ok', json);
  }

  const maskedRows = useMemo(() => {
    if (!rows) return [];
    if (!maskInUi) return rows;
    return rows.map(r => ({ ...r, phone: maskPhoneLocal(r.phone) }));
  }, [rows, maskInUi]);

  if (!authed) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Admin — Sign In</h1>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, minWidth: 320 }}
          />
          <button onClick={onLogin} style={{ padding: '8px 12px' }}>Sign In</button>
        </div>
        <p style={{ marginTop: 8, color: '#555' }}>
          Or append <code>?token=YOUR_TOKEN</code> to the URL.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <button onClick={onLogout} style={{ padding: '6px 10px' }}>Sign Out</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        <label>
          Max rows:{' '}
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(500, parseInt(e.target.value || '50', 10))))}
            style={{ width: 80 }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={maskInUi}
            onChange={(e) => setMaskInUi(e.target.checked)}
          />{' '}
          Mask numbers in table
        </label>
        <button onClick={loadSubscribers} disabled={loading} style={{ padding: '6px 10px' }}>
          {loading ? 'Loading…' : 'Load Subscribers'}
        </button>
        <button onClick={exportCsvServer} style={{ padding: '6px 10px' }}>
          Export CSV (server)
        </button>
        <button onClick={runDiag} style={{ padding: '6px 10px' }}>
          Run Diagnostics
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <input
          value={sendPhone}
          onChange={(e) => setSendPhone(e.target.value)}
          placeholder="+13095551234"
          style={{ padding: 6, border: '1px solid #ccc', borderRadius: 6, minWidth: 240 }}
        />
        <button onClick={() => forceSend(sendPhone)} style={{ padding: '6px 10px' }}>
          Force Send
        </button>
        <label>
          <input
            type="checkbox"
            checked={sendReal}
            onChange={(e) => setSendReal(e.target.checked)}
          />{' '}
          Real send (unchecked = dry run)
        </label>
      </div>

      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={th}>Phone</th>
              <th style={th}>Active</th>
              <th style={th}>ZIP</th>
              <th style={th}>Dur</th>
              <th style={th}>TZ</th>
              <th style={th}>Hour</th>
              <th style={th}>Created</th>
              <th style={th}>Last Sent</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {maskedRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 8, textAlign: 'center', color: '#666' }}>
                  {loading ? 'Loading…' : 'No rows yet.'}
                </td>
              </tr>
            ) : (
              maskedRows.map((r, i) => {
                const created =
                  typeof rows[i]?.createdAt === 'string'
                    ? new Date(rows[i]?.createdAt as string)
                    : (rows[i]?.createdAt as Date | undefined);
                const last =
                  typeof rows[i]?.lastSentAt === 'string'
                    ? new Date(rows[i]?.lastSentAt as string)
                    : (rows[i]?.lastSentAt as Date | null | undefined);
                return (
                  <tr key={i}>
                    <td style={td}>{r.phone}</td>
                    <td style={td}>{r.active ? 'Yes' : 'No'}</td>
                    <td style={td}>{r.zip ?? ''}</td>
                    <td style={td}>{r.durationMin ?? ''}</td>
                    <td style={td}>{r.timeZone ?? ''}</td>
                    <td style={td}>{r.deliveryHourLocal ?? ''}</td>
                    <td style={td}>{created ? created.toLocaleString() : ''}</td>
                    <td style={td}>{last ? new Date(last).toLocaleString() : ''}</td>
                    <td style={td}>
                      <button
                        onClick={() => forceSend((rows[i]?.phone || '').trim())}
                        style={{ padding: '4px 8px' }}
                        title="Force send to this subscriber"
                      >
                        Force
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Diagnostics output</label>
        <textarea
          readOnly
          value={diagOutput}
          placeholder="Click Run Diagnostics to see /api/diag output"
          style={{
            width: '100%',
            minHeight: 160,
            padding: 8,
            border: '1px solid #ccc',
            borderRadius: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
            fontSize: 12,
          }}
        />
      </div>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #ddd',
  padding: '6px 8px',
  whiteSpace: 'nowrap',
  fontWeight: 600,
  fontSize: 12,
};

const td: React.CSSProperties = {
  borderBottom: '1px solid #eee',
  padding: '6px 8px',
  whiteSpace: 'nowrap',
  fontSize: 13,
};
