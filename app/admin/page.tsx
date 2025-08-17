// app/admin/page.tsx
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

  async function fetchRows() {
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
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: 0 }}>Admin — Subscribers</h1>
      <p style={{ color: "#475569" }}>View recent website submissions.</p>

      <div
        style={{
          display: "grid",
          gap: 12,
          maxWidth: 520,
          margin: "12px 0 20px",
        }}
      >
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
            max={200}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 120, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
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
          {rows && (
            <div style={{ alignSelf: "center", color: "#475569" }}>
              {rows.length} row(s)
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
