// app/admin/AdminClient.tsx
'use client';

import React, { useCallback, useMemo, useState } from 'react';

type ForceResult = {
  ok: boolean;
  mode?: 'admin' | 'cron';
  sent?: number;
  matches?: number;
  details?: Array<any>;
  error?: string;
};

// Safe cookie reader
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ');
  for (const p of parts) {
    const [k, ...rest] = p.split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export default function AdminClient() {
  const [phone, setPhone] = useState<string>('');
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ForceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminToken = useMemo(() => getCookie('admin_token') || '', []);

  const runForce = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams();
      params.set('force', '1');
      if (phone.trim()) params.set('phone', phone.trim());
      if (dryRun) {
        params.set('dry', '1'); // keep it non-sending
      } else {
        params.set('send', '1'); // actually send
      }

      const url = `/api/cron/send-daily?${params.toString()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: adminToken ? { 'x-admin-token': adminToken } : undefined,
      });

      const text = await res.text();
      // Try to parse JSON; if it fails, show the raw
      let json: ForceResult;
      try {
        json = JSON.parse(text);
      } catch {
        setError(`Unexpected response (status ${res.status}): ${text.slice(0, 400)}…`);
        setLoading(false);
        return;
      }

      if (!res.ok || !json.ok) {
        setError(json.error || `HTTP ${res.status}`);
        setResult(json);
      } else {
        setResult(json);
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [adminToken, phone, dryRun]);

  const topHint = useMemo(() => {
    if (!result) return '';
    if (result.ok && result.mode) {
      return `Authorized as ${result.mode}. Matches: ${result.matches ?? 0}, Sent: ${result.sent ?? 0}`;
    }
    return '';
  }, [result]);

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ margin: 0 }}>Admin — Force Send Preview</h1>
      <p style={{ marginTop: 8, color: '#475569' }}>
        Trigger the daily message for a single number and see the exact chart image that would be sent via SMS/MMS.
      </p>

      <section
        style={{
          marginTop: 16,
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16,
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Phone (E.164){' '}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              style={{ border: '1px solid #cbd5e1', padding: '6px 8px', borderRadius: 8, minWidth: 220 }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (don’t send SMS)
          </label>

          <button
            type="button"
            onClick={runForce}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #0ea5e9',
              background: loading ? '#93c5fd' : '#0ea5e9',
              color: 'white',
              fontWeight: 600,
            }}
          >
            {loading ? 'Running…' : dryRun ? 'Force (dry preview)' : 'Force (send real)'}
          </button>
        </div>

        {topHint ? (
          <p style={{ marginTop: 10, color: '#334155' }}>{topHint}</p>
        ) : null}
      </section>

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: '1px solid #fecaca',
            background: '#fff1f2',
            color: '#b91c1c',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <section style={{ marginTop: 16 }}>
          {/* Inline pretty cards for each detail with chart image if present */}
          {(result.details || []).length ? (
            <div style={{ display: 'grid', gap: 16 }}>
              {result.details!.map((d, idx) => {
                const hasChart = typeof d.chartUrl === 'string' && d.chartUrl.length > 0;
                const smsText = d.sms ?? d.smsPreview ?? '';
                const header =
                  d.phone || d.zip || d.tz
                    ? [d.phone ? `📱 ${d.phone}` : null, d.zip ? `📍 ${d.zip}` : null, d.tz ? `🕒 ${d.tz}` : null]
                        .filter(Boolean)
                        .join(' · ')
                    : `Result ${idx + 1}`;

                return (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: 16,
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{header}</h3>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {hasChart ? (
                          <a
                            href={d.chartUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              textDecoration: 'none',
                              border: '1px solid #e2e8f0',
                              padding: '6px 10px',
                              borderRadius: 8,
                              color: '#0f172a',
                              background: '#f8fafc',
                            }}
                          >
                            Open chart
                          </a>
                        ) : null}
                        {d.sent ? (
                          <span
                            style={{
                              border: '1px solid #86efac',
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: '#f0fdf4',
                              color: '#166534',
                              fontWeight: 600,
                            }}
                          >
                            Sent
                          </span>
                        ) : null}
                        {d.error ? (
                          <span
                            title={d.error}
                            style={{
                              border: '1px solid #fecaca',
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: '#fff1f2',
                              color: '#b91c1c',
                              fontWeight: 600,
                            }}
                          >
                            Error
                          </span>
                        ) : null}
                        {d.skipped ? (
                          <span
                            title={d.skipped}
                            style={{
                              border: '1px solid #fde68a',
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: '#fffbeb',
                              color: '#92400e',
                              fontWeight: 600,
                            }}
                          >
                            Skipped
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* SMS preview */}
                    {smsText ? (
                      <pre
                        style={{
                          marginTop: 12,
                          whiteSpace: 'pre-wrap',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: 12,
                          color: '#0f172a',
                        }}
                      >
                        {smsText}
                      </pre>
                    ) : null}

                    {/* Inline chart image (exact QuickChart config used for MMS) */}
                    {hasChart ? (
                      <div style={{ marginTop: 12 }}>
                        <img
                          src={d.chartUrl}
                          alt="QuickChart MMS preview"
                          style={{ width: '100%', maxWidth: 900, borderRadius: 10, border: '1px solid #e2e8f0' }}
                        />
                      </div>
                    ) : null}

                    {/* Raw JSON for this row (collapsible feel via details/summary) */}
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: 'pointer' }}>Raw</summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: 'pre-wrap',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: 12,
                          color: '#0f172a',
                          maxHeight: 360,
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(d, null, 2)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 12,
                background: '#ffffff',
                color: '#334155',
              }}
            >
              {result.ok
                ? 'No details were returned.'
                : `Error: ${result.error ?? 'Unknown error'}`}
            </div>
          )}

          {/* Whole response JSON */}
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer' }}>Full response JSON</summary>
            <pre
              style={{
                marginTop: 8,
                whiteSpace: 'pre-wrap',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
                color: '#0f172a',
                maxHeight: 480,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}
