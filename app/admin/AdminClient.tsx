'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Json = any;

function getOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, days = 180) {
  if (typeof document === 'undefined') return;
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax; Secure`;
}

function pretty(obj: Json) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: res.ok, status: res.status, data: { raw: text } };
  }
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>{children}</div>;
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #CBD5E1',
        background: '#0EA5E9',
        color: 'white',
        fontWeight: 600,
        cursor: 'pointer',
        ...(props.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
      }}
    />
  );
}

function BtnSecondary(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #CBD5E1',
        background: 'white',
        color: '#0F172A',
        fontWeight: 600,
        cursor: 'pointer',
        ...(props.disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
      }}
    />
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid #CBD5E1',
        fontFamily: 'inherit',
        ...(props.style || {}),
      }}
    />
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ transform: 'scale(1.15)' }}
      />
      <span>{label}</span>
    </label>
  );
}

export default function AdminClient() {
  // Auth
  const [token, setToken] = useState('');
  const [useCronSecret, setUseCronSecret] = useState(false);
  const [secret, setSecret] = useState('');
  const [maskAuth, setMaskAuth] = useState(true);

  // Force send controls
  const [phone, setPhone] = useState('');
  const [dryRun, setDryRun] = useState(true); // default safe
  const [isLoading, setIsLoading] = useState(false);

  // Responses / logs
  const [lastForceUrl, setLastForceUrl] = useState('');
  const [forceResult, setForceResult] = useState<Json | null>(null);

  // Subscribers (Load & CSV)
  const [subs, setSubs] = useState<Json[] | null>(null);
  const [loadMaskPhones, setLoadMaskPhones] = useState(true);
  const [limit, setLimit] = useState(50);

  // On mount: read cookies for ADMIN token (and optional CRON secret if you saved one)
  useEffect(() => {
    const t = readCookie('admin_token');
    if (t) setToken(t);
    const s = readCookie('cron_secret');
    if (s) setSecret(s);
  }, []);

  // Helpers
  const base = useMemo(() => getOrigin(), []);
  const authLabel = useCronSecret ? 'Cron Secret' : 'Admin Token';
  const authValue = useCronSecret ? secret : token;
  const setAuthValue = (v: string) => (useCronSecret ? setSecret(v) : setToken(v));

  const displayAuth = maskAuth ? (authValue ? `${authValue.slice(0, 3)}…${authValue.slice(-3)}` : '') : authValue;

  function saveAuthToCookie() {
    if (!authValue) return;
    if (useCronSecret) {
      writeCookie('cron_secret', authValue, 180);
    } else {
      writeCookie('admin_token', authValue, 180);
    }
    alert(`${authLabel} saved to cookie.`);
  }

  function buildForceUrl() {
    const u = new URL(`${base}/api/cron/send-daily`);
    if (dryRun) u.searchParams.set('dry', '1');
    else u.searchParams.set('send', '1');
    if (phone.trim()) u.searchParams.set('phone', phone.trim());

    if (useCronSecret) {
      u.searchParams.set('secret', secret.trim());
    } else {
      u.searchParams.set('token', token.trim());
    }
    // Optional: show extra info
    u.searchParams.set('debug', '1');
    return u.toString();
  }

  async function handleForce() {
    const url = buildForceUrl();
    setLastForceUrl(url);
    setIsLoading(true);
    setForceResult(null);
    try {
      const res = await fetchJson(url);
      setForceResult({ status: res.status, ...res.data });
    } catch (e: any) {
      setForceResult({ error: e?.message || 'request failed' });
    } finally {
      setIsLoading(false);
    }
  }

  function openForceInNewTab() {
    const url = buildForceUrl();
    setLastForceUrl(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleLoadSubscribers() {
    if (!token) {
      alert('Admin token required for loading subscribers.');
      return;
    }
    const u = new URL(`${base}/api/admin/subscribers`);
    u.searchParams.set('token', token.trim());
    u.searchParams.set('limit', String(Math.max(1, Math.min(500, limit))));
    u.searchParams.set('mask', loadMaskPhones ? '1' : '0');

    setIsLoading(true);
    setSubs(null);
    try {
      const res = await fetchJson(u.toString());
      if (!res.ok) {
        setSubs([{ error: `HTTP ${res.status}`, body: res.data }]);
      } else {
        const rows = (res.data?.rows as Json[]) ?? [];
        setSubs(rows);
      }
    } catch (e: any) {
      setSubs([{ error: e?.message || 'load failed' }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleExportCsvServer() {
    if (!token) {
      alert('Admin token required to export CSV.');
      return;
    }
    const u = new URL(`${base}/api/admin/subscribers`);
    u.searchParams.set('token', token.trim());
    u.searchParams.set('csv', '1');
    // Let the browser download it
    window.open(u.toString(), '_blank', 'noopener,noreferrer');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied!');
    } catch {
      alert('Copy failed — your browser may block clipboard access on this page.');
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <p style={{ color: '#475569', marginTop: 6 }}>Run the daily job manually, view results, and export subscribers.</p>

      {/* Auth */}
      <div style={{ marginTop: 18, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12 }}>
        <SmallLabel>Authentication</SmallLabel>
        <FieldRow>
          <Checkbox
            checked={useCronSecret}
            onChange={setUseCronSecret}
            label="Use Cron Secret (instead of Admin Token)"
          />
        </FieldRow>
        <FieldRow>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{authLabel}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                type={maskAuth ? 'password' : 'text'}
                placeholder={useCronSecret ? 'Paste CRON_SECRET' : 'Paste ADMIN_TOKEN'}
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
                style={{ minWidth: 420 }}
              />
              <BtnSecondary type="button" onClick={() => setMaskAuth((v) => !v)}>
                {maskAuth ? 'Show' : 'Hide'}
              </BtnSecondary>
              <BtnSecondary type="button" onClick={() => copy(authValue)}>
                Copy
              </BtnSecondary>
              <BtnSecondary type="button" onClick={saveAuthToCookie}>
                Save Cookie
              </BtnSecondary>
            </div>
            {authValue ? (
              <div style={{ fontSize: 12, color: '#64748B' }}>Current: {displayAuth}</div>
            ) : (
              <div style={{ fontSize: 12, color: '#64748B' }}>No {authLabel.toLowerCase()} set</div>
            )}
          </label>
        </FieldRow>
      </div>

      {/* Force section */}
      <div style={{ marginTop: 20, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12 }}>
        <SmallLabel>Force Run / Preview</SmallLabel>
        <FieldRow>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Phone (optional, +1XXXXXXXXXX)</span>
            <Input
              placeholder="+1XXXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: 240 }}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Mode</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <Checkbox checked={dryRun} onChange={setDryRun} label="Dry run (no SMS)" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Btn type="button" onClick={handleForce} disabled={isLoading || !authValue}>
              {isLoading ? 'Running…' : 'Force (Show Result Below)'}
            </Btn>
            <BtnSecondary type="button" onClick={openForceInNewTab} disabled={!authValue}>
              Open in New Tab
            </BtnSecondary>
          </div>
        </FieldRow>

        {lastForceUrl ? (
          <div
            style={{
              background: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              padding: 10,
              borderRadius: 8,
              marginTop: 10,
              wordBreak: 'break-all',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: '#475569' }}>Last request URL</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <BtnSecondary type="button" onClick={() => copy(lastForceUrl)}>
                  Copy URL
                </BtnSecondary>
                <BtnSecondary type="button" onClick={() => window.open(lastForceUrl, '_blank', 'noopener,noreferrer')}>
                  Open
                </BtnSecondary>
              </div>
            </div>
            <code style={{ fontSize: 12 }}>{lastForceUrl}</code>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <SmallLabel>Result</SmallLabel>
          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: 12,
              background: '#FFFFFF',
            }}
          >
            {forceResult ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>Response</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <BtnSecondary type="button" onClick={() => copy(pretty(forceResult))}>
                      Copy JSON
                    </BtnSecondary>
                  </div>
                </div>

                {/* If the payload includes details[].chartUrl, surface as quick links */}
                {Array.isArray(forceResult?.details) && forceResult.details.length > 0 ? (
                  <div style={{ marginBottom: 10 }}>
                    <SmallLabel>Charts</SmallLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {forceResult.details
                        .map((d: any) => d?.chartUrl)
                        .filter(Boolean)
                        .map((url: string, i: number) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: '1px solid #CBD5E1',
                              background: '#F1F5F9',
                              fontSize: 12,
                            }}
                          >
                            Chart #{i + 1}
                          </a>
                        ))}
                    </div>
                  </div>
                ) : null}

                <pre
                  style={{
                    maxHeight: 420,
                    overflow: 'auto',
                    background: '#0F172A',
                    color: '#E2E8F0',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
{pretty(forceResult)}
                </pre>
              </>
            ) : (
              <div style={{ color: '#64748B' }}>No result yet — click “Force” to run and see the response here.</div>
            )}
          </div>
        </div>
      </div>

      {/* Subscribers */}
      <div style={{ marginTop: 20, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12 }}>
        <SmallLabel>Subscribers</SmallLabel>
        <FieldRow>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Limit</span>
            <Input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value || '50', 10))}
              style={{ width: 120 }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <Checkbox checked={loadMaskPhones} onChange={setLoadMaskPhones} label="Mask phone numbers" />
            <BtnSecondary type="button" onClick={handleLoadSubscribers} disabled={isLoading || !token}>
              Load Submissions
            </BtnSecondary>
            <Btn type="button" onClick={handleExportCsvServer} disabled={!token}>
              Export CSV (server)
            </Btn>
          </div>
        </FieldRow>

        <div style={{ marginTop: 10 }}>
          {subs === null ? (
            <div style={{ color: '#64748B' }}>No data loaded yet.</div>
          ) : Array.isArray(subs) && subs.length > 0 ? (
            <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['phone', 'active', 'zip', 'durationMin', 'timeZone', 'deliveryHourLocal', 'createdAt', 'lastSentAt'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E2E8F0', fontWeight: 600 }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {subs.map((r: any, i: number) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.phone ?? ''}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{String(r.active ?? '')}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.zip ?? ''}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.durationMin ?? ''}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.timeZone ?? ''}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.deliveryHourLocal ?? ''}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.createdAt ?? ''}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{r.lastSentAt ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: '#64748B' }}>No rows found.</div>
          )}
        </div>
      </div>
    </main>
  );
}
