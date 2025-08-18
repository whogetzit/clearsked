'use client';

import React, { useEffect, useMemo, useState } from 'react';

/** -------------------- Types -------------------- */
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

  // thresholds (may come from prefs or columns server-side)
  tempMin?: number | null;
  tempMax?: number | null;
  windMax?: number | null;
  uvMax?: number | null;
  aqiMax?: number | null;
  humidityMax?: number | null;
  precipMax?: number | null;
  cloudMax?: number | null;
};

type SubsResponse = {
  ok: boolean;
  count?: number;
  rows?: SubscriberRow[];
  error?: string;
};

/** -------------------- Small utils -------------------- */
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

/** Build URL with query params and token as query fallback */
function buildUrl(path: string, params: Record<string, string | number | boolean | undefined>, token: string) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined) return;
    url.searchParams.set(k, String(v));
  });
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

/** Centralized fetch that sends token as header + includes cookies */
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

/** -------------------- Component -------------------- */
export default function AdminClient() {
  const [token, setToken] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [authed, setAuthed] = useState<boolean>(false);

  const [limit, setLimit] = useState<number>(50);
  const [maskInUi, setMaskInUi] = useState<boolean>(true);

  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [diagOutput, setDiagOutput] = useState<string>('');

  const [sendPhone, setSendPhone] = useState<string>('');
  const [sendReal, setSendReal] = useState<boolean>(false);

  /** ---------- Bootstrap token from URL -> cookie -> localStorage ---------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1) URL ?token=
    const fromUrl = parseTokenFromUrl();
    if (fromUrl) {
      setToken(fromUrl);
      setTokenInput(fromUrl);
      setCookie('admin_token', fromUrl);
      try {
        localStorage.setItem('admin_token', fromUrl);
      } catch {}
      setAuthed(true);
      return;
    }

    // 2) Cookie
    const fromCookie = getCookie('admin_token');
    if (fromCookie) {
      setToken(fromCookie);
      setTokenInput(fromCookie);
      setAuthed(true);
      return;
    }

    // 3) localStorage
    try {
      const fromLs = localStorage.getItem('admin_token');
      if (fromLs) {
        setToken(fromLs);
        setTokenInput(fromLs);
        setCookie('admin_token', fromLs);
        setAuthed(true);
        return;
      }
    } catch {}

    setAuthed(false);
  }, []);

  /** ---------- Handlers ---------- */
  const onLogin = () => {
    const t = tokenInput.trim();
    if (!t) {
      alert('Enter an admin token.');
      return;
    }
    setToken(t);
    setCookie('admin_token', t);
    try {
      localStorage.setItem('admin_token', t);
    } catch {}
    setAuthed(true);
  };

  const onLogout = () => {
    setToken('');
    setTokenInput('');
    setAuthed(false);
    setRows([]);
    setDiagOutput('');
    // expire cookie
    document.cookie = `admin_token=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    try {
      localStorage.removeItem('admin_token');
    } catch {}
  };

  async function loadSubscribers() {
    if (!token) {
      alert('No admin token in this session');
      return;
    }
    setLoading(true);
    setRows([]);
    setDiagOutput('');
    const { ok, json, status } = await apiFetchJson(
      '/api/admin/subscribers',
      { limit, mask: 0 }, // fetch unmasked so force-send can use the real number
      token
    );
    setLoading(false);
    if (!ok) {
      console.error('loadSubscribers error', status, json);
      alert(`Load failed: ${json?.error || status}`);
      return;
    }
    const data = json as SubsResponse;
    setRows(data.rows || []);
  }

  function exportCsvServer() {
    if (!token) {
      alert('No admin token in this session');
      return;
    }
    const url = buildUrl(
      '/api/admin/subscribers.csv',
      { limit, mask: maskInUi ? 1 : 0 },
      token
    );
    // Navigate so browser downloads the file
    window.location.href = url;
  }

  async function runDiag() {
    if (!token) {
      alert('No admin token in this session');
      return;
    }
    setDiagOutput('Running /api/diag ...');
    const { ok, json, status } = await apiFetchJson('/api/diag', {}, token);
    if (!ok) {
      setDiagOutput(`Diag failed (${status}): ${JSON.stringify(json, null, 2)}`);
      return;
    }
    setDiagOutput(JSON.stringify(json, null, 2));
  }

  async function forceSend(phone: string) {
    if (!token) {
      alert('No admin token in this session');
      return;
    }
    if (!phone) {
      alert('Enter a phone number in E.164, e.g. +13095551234');
      return;
    }

    const params = {
      phone,
      bypassHour: 1,
      send: sendReal ? 1 : undefined, // omit 'send' => dry-run on server
    } as Record<string, string | number | boolean | undefined>;

    const { ok, json, status } = await apiFetchJson('/api/cron/send-daily', params, token);
    if (!ok) {
      console.error('forceSend error', status, json);
      alert(`Force send failed: ${json?.error || status}`);
      return;
    }
    alert(`Force send OK. See response in console.`);
    console.log('forceSend ok', json);
  }

  const maskedRows = useMemo(() => {
    if (!rows) return [];
    if (!maskInUi) return rows;
    return rows.map((r) => ({ ...r, phone: maskPhoneLocal(r.phone) }));
  }, [rows, maskInUi]);

  /** ---------- Render ---------- */
  if (!authed) {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Admin — Sign In</h1>
        <p style={{ color: '#475569', marginTop: 8 }}>
          Paste your admin token to manage subscribers.
        </p>

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            style={{
              padding: '10px 12px',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
          <button
            onClick={onLogin}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #0EA5E9',
              background: '#0EA5E9',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </div>

        <p style={{ marginTop: 16, color: '#64748B' }}>
          You can also pass <code>?token=YOUR_TOKEN</code> in the URL. The token is
          stored in a cookie for subsequent requests.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin — Subscribers</h1>
          <p style={{ color: '#475569', marginTop: 4 }}>
            View, export, run diagnostics, or force-send messages.
          </p>
        </div>
        <button
          onClick={onLogout}
          title="Clear token and sign out"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #E11D48',
            background: 'white',
            color: '#E11D48',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </div>

      <section
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}>
            Max rows
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(500, parseInt(e.target.value || '50', 10))))}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
            }}
          />
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}>
            Mask numbers in table
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="mask"
              type="checkbox"
              checked={maskInUi}
              onChange={(e) => setMaskInUi(e.target.checked)}
            />
            <label htmlFor="mask" style={{ fontSize: 14 }}>
              Mask in UI (export control below)
            </label>
          </div>
        </div>

        <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
          <button
            onClick={loadSubscribers}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #0EA5E9',
              background: '#0EA5E9',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Loading...' : 'Load Subscribers'}
          </button>
        </div>

        <div style={{ gridColumn: 'span 3', display: 'flex', gap: 8 }}>
          <button
            onClick={exportCsvServer}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #10B981',
              background: '#10B981',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Downloads from /api/admin/subscribers.csv"
          >
            Export CSV (server)
          </button>
          <button
            onClick={runDiag}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #64748B',
              background: 'white',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Calls /api/diag"
          >
            Run Diagnostics
          </button>
        </div>

        <div style={{ gridColumn: 'span 3' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}>
            Force Send — phone (E.164)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={sendPhone}
              onChange={(e) => setSendPhone(e.target.value)}
              placeholder="+13095551234"
              style={{
                flex: 1,
                padding: '8px 10px',
                border: '1px solid #CBD5E1',
                borderRadius: 8,
              }}
            />
            <button
              onClick={() => forceSend(sendPhone)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #F59E0B',
                background: '#F59E0B',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Calls /api/cron/send-daily?bypassHour=1&send=1 (if Real checked)"
            >
              Force Send
            </button>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="sendReal"
              type="checkbox"
              checked={sendReal}
              onChange={(e) => setSendReal(e.target.checked)}
            />
            <label htmlFor="sendReal" style={{ fontSize: 13 }}>
              Real send (unchecked = dry run)
            </label>
          </div>
        </div>
      </section>

      {/* Table */}
      <section style={{ marginTop: 20 }}>
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
            }}
          >
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={th}>Phone</th>
                <th style={th}>Active</th>
                <th style={th}>ZIP</th>
                <th style={th}>Lat</th>
                <th style={th}>Lng</th>
                <th style={th}>Duration</th>
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
                  <td colSpan={11} style={{ padding: 16, textAlign: 'center', color: '#64748B' }}>
                    {loading ? 'Loading…' : 'No rows. Click “Load Subscribers”.'}
                  </td>
                </tr>
              ) : (
                maskedRows.map((r, idx) => {
                  const created =
                    typeof rows[idx]?.createdAt === 'string'
                      ? new Date(rows[idx]?.createdAt as string)
                      : (rows[idx]?.createdAt as Date | undefined);

                  const last =
                    typeof rows[idx]?.lastSentAt === 'string'
                      ? new Date(rows[idx]?.lastSentAt as string)
                      : (rows[idx]?.lastSentAt as Date | null | undefined);

                  return (
                    <tr key={idx} style={{ borderTop: '1px solid #E2E8F0' }}>
                      <td style={td}>{r.phone}</td>
                      <td style={td}>{r.active ? 'Yes' : 'No'}</td>
                      <td style={td}>{r.zip ?? ''}</td>
                      <td style={td}>{r.latitude ?? ''}</td>
                      <td style={td}>{r.longitude ?? ''}</td>
                      <td style={td}>{r.durationMin ?? ''}</td>
                      <td style={td}>{r.timeZone ?? ''}</td>
                      <td style={td}>{r.deliveryHourLocal ?? ''}</td>
                      <td style={td}>{created ? created.toLocaleString() : ''}</td>
                      <td style={td}>{last ? new Date(last).toLocaleString() : ''}</td>
                      <td style={td}>
                        <button
                          onClick={() => forceSend((rows[idx]?.phone || '').trim())}
                          style={tinyBtn}
                          title="Force send to this subscriber (dry-run unless 'Real send' checked)"
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
      </section>

      {/* Diag output */}
      <section style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}>
          Diagnostics output
        </label>
        <textarea
          readOnly
          value={diagOutput}
          placeholder="Click Run Diagnostics to see /api/diag output"
          style={{
            width: '100%',
            minHeight: 160,
            padding: 12,
            border: '1px solid #CBD5E1',
            borderRadius: 8,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
            fontSize: 12,
            color: '#0F172A',
          }}
        />
      </section>
    </main>
  );
}

/** -------------------- Table cell styles -------------------- */
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  color: '#475569',
  fontWeight: 700,
  borderBottom: '1px solid #E2E8F0',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  color: '#0F172A',
  whiteSpace: 'nowrap',
};

const tinyBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #F59E0B',
  background: '#F59E0B',
  color: 'white',
  fontWeight: 700,
  cursor: 'pointer',
};
