"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  createdAt: string;
  phoneE164: string | null;
  phoneMasked: string | null;
  zip: string;
  durationMin: number;
  active: boolean;
  lastSentAt: string | null;
  prefs: any;
};

function rowsToCsv(rows: Row[]) {
  const headers = [
    "id",
    "createdAt",
    "phoneE164",
    "zip",
    "durationMin",
    "active",
    "lastSentAt",
    "prefs",
  ];

  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    let s = String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const r of rows) {
    lines.push(
      [
        r.id,
        new Date(r.createdAt).toISOString(),
        r.phoneE164 ?? "",
        r.zip,
        r.durationMin,
        r.active ? "true" : "false",
        r.lastSentAt ? new Date(r.lastSentAt).toISOString() : "",
        r.prefs ? JSON.stringify(r.prefs) : "",
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(50);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ADMIN_KEY");
    if (saved) setKey(saved);
  }, []);

  const canFetch = useMemo(() => key.trim().length > 0, [key]);

  const fetchRows = async () => {
    if (!canFetch) return;
    setLoading(true);
    setErr(null);
    setRows(null);
    try {
      const res = await fetch(`/api/admin/subscribers?limit=${limit}`, {
        headers: { "x-admin-key": key.trim() },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.rows as Row[]);
      localStorage.setItem("ADMIN_KEY", key.trim());
    } catch (e: any) {
      setErr(e?.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const exportCsvClient = () => {
    if (!rows || rows.length === 0) return;
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `subscribers-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsvServer = async () => {
    try {
      const res = await fetch(`/api/admin/subscribers.csv?limit=${limit}`, {
        headers: { "x-admin-key": key.trim() },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `subscribers-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? "CSV download failed");
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: 0 }}>Admin — Subscribers</h1>
      <p style={{ color: "#475569" }}>View and export website submissions.</p>

      <div style={{ display: "grid", gap: 12, maxWidth: 520, margin: "12px 0 20px" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Admin key</span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter ADMIN_KEY"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Limit</span>
          <input
            type="number"
            min={1}
            max={2000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 140, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Used for query and server CSV export.
          </span>
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={fetchRows}
            disabled={!canFetch || loading}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid transparent",
              background: canFetch && !loading ? "#0f172a" : "#cbd5e1",
              color: "#fff",
              cursor: canFetch && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Loading…" : "Load submissions"}
          </button>

          <button
            onClick={exportCsvClient}
            disabled={!rows || rows.length === 0}
            title={!rows ? "Load rows first" : "Export the rows currently loaded"}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#0f172a",
              cursor: rows && rows.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            Export CSV (current)
          </button>

          <button
            onClick={exportCsvServer}
            disabled={!canFetch}
            title="Download CSV directly from server"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#0f172a",
              cursor: canFetch ? "pointer" : "not-allowed",
            }}
          >
            Export CSV (server)
          </button>

          {rows && (
            <div style={{ alignSelf: "center", color: "#475569" }}>
              {rows.length} row(s) loaded
            </div>
          )}
        </div>

        {err && (
          <div
            role="alert"
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: 10,
              borderRadius: 8,
            }}
          >
            {err}
          </div>
        )}
      </div>

      {rows && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
            }}
          >
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "createdAt",
                  "phone",
                  "zip",
                  "durationMin",
                  "active",
                  "lastSentAt",
                  "prefs",
                  "id",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                    {r.phoneMasked ?? r.phoneE164}
                  </td>
                  <td style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                    {r.zip}
                  </td>
                  <td style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                    {r.durationMin}
                  </td>
                  <td style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                    {r.active ? "yes" : "no"}
                  </td>
                  <td style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                    {r.lastSentAt ? new Date(r.lastSentAt).toLocaleString() : "—"}
                  </td>
                  <td
                    style={{
                      padding: 10,
                      borderTop: "1px solid #f1f5f9",
                      maxWidth: 320,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12,
                    }}
                    title={JSON.stringify(r.prefs)}
                  >
                    {JSON.stringify(r.prefs)}
                  </td>
                  <td
                    style={{
                      padding: 10,
                      borderTop: "1px solid #f1f5f9",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12,
                    }}
                  >
                    {r.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
