// app/admin/AdminClient.tsx
'use client';

import React from 'react';

/** Read the admin token cookie (non-HttpOnly) set at login. */
function readAdminCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === 'admin_token') return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Robust fetcher: get text, try JSON, show raw on parse failure. */
async function fetchSafeJSON(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, {
    ...init,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (err: any) {
    // Not JSON — return a shaped object with raw text for visibility
    parsed = {
      ok: false,
      parseError: err?.message || 'JSON parse failed',
      raw: text,
      status: res.status,
      statusText: res.statusText,
    };
  }

  // If HTTP error, carry the payload up as an error, but include text/parsed
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && parsed.error) ||
      `${res.status} ${res.statusText}`;
    const e = new Error(msg) as any;
    e.response = parsed ?? text;
    throw e;
  }

  // Success
  return parsed ?? { ok: true, raw: text };
}

export default function AdminClient() {
  const [token, setToken] = React.useState<string>('');
  const [phone, setPhone] = React.useState<string>('');
  const [consoleOut, setConsoleOut] = React.useState<string>('Ready.');
  const [busy, setBusy] = React.useState<boolean>(false);

  // On mount, grab admin cookie as default token
  React.useEffect(() => {
    const t = readAdminCookie();
    if (t) setToken(t);
  }, []);

  function setPretty(obj: any) {
    try {
      setConsoleOut(JSON.stringify(obj, null, 2));
    } catch {
      setConsoleOut(String(obj));
    }
  }

  function buildURL(opts: { dry?: boolean; force?: boolean; phone?: string }) {
    const q = new URLSearchParams();
    if (opts.dry) q.set('dry', '1');
    if (opts.force) q.set('force', '1');
    if (opts.phone) q.set('phone', opts.phone);
    // Send token in query to avoid cookie edge cases
    if (token) q.set('token', token);
    return `/api/cron/send-daily?${q.toString()}`;
  }

  async function runForce(dry: boolean) {
    setBusy(true);
    setPretty({ running: 'force send', dry, phone: phone || null });

    const url = buildURL({ dry, force: true, phone: phone || undefined });
    try {
      const data = await fetchSafeJSON(url, {
        method: 'GET',
        headers: token ? { 'x-admin-token': token } : undefined, // also send via header
      });
      setPretty({
        success: true,
        url,
        usedHeader: !!token,
        result: data,
      });
    } catch (err: any) {
      setPretty({
        success: false,
        url,
        usedHeader: !!token,
        error: err?.message || 'request failed',
        response: err?.response ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function runDryAll() {
    setBusy(true);
    const url = buildURL({ dry: true, force: true });
    try {
      const data = await fetchSafeJSON(url, {
        method: 'GET',
        headers: token ? { 'x-admin-token': token } : undefined,
      });
      setPretty({ success: true, url, result: data });
    } catch (err: any) {
      setPretty({
        success: false,
        url,
        error: err?.message || 'request failed',
        response: err?.response ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function runDiag() {
    setBusy(true);
    const q = new URLSearchParams();
    if (token) q.set('token', token);
    const url = `/api/cron/send-daily?diag=1&${q.toString()}`;
    try {
      const data = await fetchSafeJSON(url, {
        method: 'GET',
        headers: token ? { 'x-admin-token': token } : undefined,
      });
      setPretty({ success: true, url, result: data });
    } catch (err: any) {
      setPretty({
        success: false,
        url,
        error: err?.message || 'request failed',
        response: err?.response ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: 0 }}>Admin — Tools</h1>
      <p style={{ color: '#475569' }}>
        Force send and dry-run previews. Results show below with raw responses if parsing fails.
      </p>

      <section
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: '1fr',
          marginTop: 12,
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#334155' }}>Admin Token</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Your admin token…"
            style={{
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Sent in query (&token=) and header (x-admin-token) so auth is reliable.
          </span>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#334155' }}>Phone (optional)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1XXXXXXXXXX"
            style={{
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Leave empty to run for all due subscribers.
          </span>
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => runForce(true)}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #94a3b8',
              background: '#f1f5f9',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Force (dry-run)
          </button>
          <button
            onClick={() => runForce(false)}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #059669',
              background: '#10b981',
              color: 'white',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Force (send)
          </button>
          <button
            onClick={runDryAll}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #3b82f6',
              background: '#60a5fa',
              color: 'white',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Dry-run (all)
          </button>
          <button
            onClick={runDiag}
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #a855f7',
              background: '#c084fc',
              color: 'white',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Diag
          </button>
        </div>
      </section>

      <section>
        <div
          style={{
            fontSize: 13,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            whiteSpace: 'pre-wrap',
            background: '#0b1220',
            color: '#e5e7eb',
            padding: 12,
            borderRadius: 8,
            minHeight: 220,
            border: '1px solid #1f2937',
          }}
        >
          {consoleOut}
        </div>
      </section>
    </main>
  );
}
