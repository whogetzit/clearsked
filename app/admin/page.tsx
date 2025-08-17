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
      ].map(esc).join(",")
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
    const csv = rowsToCsv(
