// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/* ----------------------------- helpers/types ----------------------------- */
type Prefs = { tempMin: number; tempMax: number; windMax: number; uvMax: number; aqiMax: number; };
type SportPresetKey = "running" | "cycling" | "tennis" | "kids";

const SPORT_PRESETS: Record<SportPresetKey, { label: string; prefs: Prefs }> = {
  running:  { label: "Running",  prefs: { tempMin: 45, tempMax: 68, windMax: 12, uvMax: 6, aqiMax: 100 } },
  cycling:  { label: "Cycling",  prefs: { tempMin: 50, tempMax: 72, windMax: 14, uvMax: 7, aqiMax: 100 } },
  tennis:   { label: "Tennis/Pickleball", prefs: { tempMin: 55, tempMax: 75, windMax: 10, uvMax: 7, aqiMax: 100 } },
  kids:     { label: "Kids’ Play", prefs: { tempMin: 55, tempMax: 80, windMax: 10, uvMax: 5, aqiMax: 80 } },
};

const DURATIONS = [30, 45, 60, 90];

function detectLocalTZ() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"; }
  catch { return "America/Chicago"; }
}

function isZipValid(zip: string) { return /^\d{5}$/.test(zip); }

function digitsOnly(s: string) { return s.replace(/\D/g, ""); }
function formatPhoneDisplay(d: string) {
  const x = digitsOnly(d);
  if (x.length <= 3) return x;
  if (x.length <= 6) return `(${x.slice(0,3)}) ${x.slice(3)}`;
  if (x.length <= 10) return `(${x.slice(0,3)}) ${x.slice(3,6)}-${x.slice(6)}`;
  return `+${x}`;
}
function toE164US(d: string): string | null {
  const x = digitsOnly(d);
  if (x.length === 10) return `+1${x}`;
  if (x.length === 11 && x.startsWith("1")) return `+${x}`;
  if (x.startsWith("+") && x.length >= 10) return `+${x}`;
  return null;
}

/* ------------------------------- small UI bits ------------------------------- */
function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid " + (active ? "#0f172a" : "#e5e7eb"),
        background: active ? "#0f172a" : "#fff",
        color: active ? "#fff" : "#0f172a",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
function DurationChips({ value, onChange }: { value: number; onChange: (v: number) => void; }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {DURATIONS.map((d) => (
        <Chip key={d} active={value === d} onClick={() => onChange(d)}>{d} min</Chip>
      ))}
    </div>
  );
}
function SportPresets({ value, onChange }: { value: SportPresetKey; onChange: (k: SportPresetKey) => void; }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {Object.entries(SPORT_PRESETS).map(([k, v]) => (
        <Chip key={k} active={value === (k as SportPresetKey)} onClick={() => onChange(k as SportPresetKey)}>
          {v.label}
        </Chip>
      ))}
    </div>
  );
}
function RangeField(props: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; suffix?: string;
}) {
  const { label, min, max, step, value, onChange, suffix } = props;
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: "#475569" }}>{value}{suffix ?? ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>{min}{suffix ?? ""}</span><span>{max}{suffix ?? ""}</span>
      </div>
    </label>
  );
}
function DeliveryTimeSelect({ timeZone, valueHour, onChange }: { timeZone: string; valueHour: number; onChange: (h: number) => void; }) {
  const options = [5, 6, 7];
  const fmt = (h: number) => {
    try {
      const dtf = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone });
      const d = new Date(); d.setHours(h, 0, 0, 0); return dtf.format(d);
    } catch { return `${h}:00`; }
  };
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 600 }}>Delivery time (your timezone)</span>
      <select value={valueHour} onChange={(e) => onChange(Number(e.target.value))} style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
        {options.map((h) => <option key={h} value={h}>{fmt(h)} ({timeZone})</option>)}
      </select>
      <span style={{ fontSize: 12, color: "#475569" }}>Default is 5:00 AM. You can change this later.</span>
    </label>
  );
}

/** sample comfort chart with colored bands */
function SampleChart() {
  const scores = [28, 35, 48, 62, 74, 87, 92, 90, 84, 70, 52, 40]; // demo data
  const width = 360, height = 100, pad = 8;
  const step = (width - pad * 2) / (scores.length - 1);
  const pts = scores.map((s, i) => {
    const x = pad + i * step;
    const y = height - pad - (s / 100) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", display: "inline-block" }}>
      <svg width={width} height={height} role="img" aria-label="Sample comfort chart">
        {/* bands */}
        <rect x={0} y={0} width={width} height={height} fill="#fff" />
        <rect x={0} y={height * 0.0} width={width} height={height * 0.33} fill="#fee2e2" />   {/* red zone (0–33) */}
        <rect x={0} y={height * 0.33} width={width} height={height * 0.34} fill="#fef3c7" /> {/* yellow (33–66) */}
        <rect x={0} y={height * 0.67} width={width} height={height * 0.33} fill="#dcfce7" />  {/* green (66–100) */}
        {/* line */}
        <polyline fill="none" stroke="#0f172a" strokeWidth={2} points={pts} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
        We mark minutes outside your range as <strong>red</strong> and apply a penalty—instead of excluding them—so you still get a best window even on imperfect days.
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */
export default function Page() {
  // steps
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // zip + preview
  const [zip, setZip] = useState(""); const [zipPreview, setZipPreview] = useState<string | null>(null); const [zipBusy, setZipBusy] = useState(false);
  // duration + delivery
  const [duration, setDuration] = useState<number>(60);
  const [tz, setTz] = useState("America/Chicago"); const [deliveryHour, setDeliveryHour] = useState(5);
  // phone (masked) + prefs
  const [phoneDigits, setPhoneDigits] = useState(""); const phoneDisplay = formatPhoneDisplay(phoneDigits);
  const [preset, setPreset] = useState<SportPresetKey>("running");
  const [prefs, setP]()
