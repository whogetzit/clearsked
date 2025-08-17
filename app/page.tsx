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
  const [prefs, setPrefs] = useState<Prefs>(SPORT_PRESETS.running.prefs);
  // submission
  const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState<string | null>(null); const [ok, setOk] = useState(false);
  // bot traps
  const [hp, setHp] = useState(""); const [startedAt] = useState<number>(() => Date.now());

  useEffect(() => { setPrefs(SPORT_PRESETS[preset].prefs); }, [preset]);
  useEffect(() => { setTz(detectLocalTZ()); }, []);

  const zipStatus = useMemo(() => {
    if (!zip) return null;
    if (!isZipValid(zip)) return "Enter a 5-digit US ZIP";
    if (zipPreview) return zipPreview;
    return "Looks good";
  }, [zip, zipPreview]);

  async function lookupZip() {
    setZipPreview(null);
    if (!isZipValid(zip)) return;
    try {
      setZipBusy(true);
      const r = await fetch(`/api/zip/${zip}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j?.city && j?.state) setZipPreview(`${j.city}, ${j.state} (${zip})`);
      }
    } finally { setZipBusy(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setSubmitError(null);
    try {
      const phoneE164 = toE164US(phoneDigits);
      if (!phoneE164) throw new Error("Please enter a valid US mobile number");

      const payload = {
        zip,
        durationMin: duration,
        phone: phoneE164,
        deliveryHourLocal: deliveryHour,
        timeZone: tz,
        prefs,
        hp, // honeypot (must be empty)
      };

      const r = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-form-latency": ((Date.now() - startedAt) / 1000).toFixed(2),
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error((await r.text()) || `Signup failed (${r.status})`);
      setOk(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong");
    } finally { setSubmitting(false); }
  }

  return (
    <main>
      {/* Hero */}
      <section style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: 0 }}>
          We text you the best time to train—custom to your weather prefs.
        </h1>
        <p style={{ fontSize: 18, color: "#475569", marginTop: 12 }}>
          Pick your temperature, wind, and UV ranges. We score every minute from <strong>0–100</strong> and text your best window every morning.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "flex", gap: 16, color: "#334155", flexWrap: "wrap", fontSize: 14 }}>
          <li>• No app</li><li>• No login</li><li>• Cancel anytime (text STOP)</li>
        </ul>
      </section>

      {/* Form + Sample */}
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 24, alignItems: "start" }}>
        <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, display: "grid", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>Step {step} of 3</div>

          {/* Step 1: ZIP */}
          {step === 1 && (
            <div style={{ display: "grid", gap: 8 }}>
              <label htmlFor="zip" style={{ fontWeight: 600 }}>Your ZIP code</label>
              <input
                id="zip" inputMode="numeric" pattern="\d{5}" required value={zip}
                onChange={(e) => { setZip(e.target.value.slice(0,5)); setZipPreview(null); }}
                onBlur={lookupZip}
                placeholder="e.g., 61550"
                style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
                aria-describedby="zipHelp"
              />
              <div id="zipHelp" style={{ fontSize: 12, color: "#475569" }}>
                {zipBusy ? "Looking up city…" : "We’ll personalize your forecast using this location."}
              </div>
              <div role="status" style={{ fontSize: 12, color: zipPreview ? "#16a34a" : "#b91c1c", minHeight: 16 }}>
                {zipStatus ?? ""}
              </div>
              {/* honeypot (hidden) */}
              <div style={{ position: "absolute", left: -9999, top: -9999 }}>
                <label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
              </div>
              <button
                type="button" onClick={() => isZipValid(zip) && setStep(2)} disabled={!isZipValid(zip)}
                style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid transparent", background: isZipValid(zip) ? "#0f172a" : "#cbd5e1", color: "white", cursor: isZipValid(zip) ? "pointer" : "not-allowed", width: "100%" }}
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Duration + Delivery time */}
          {step === 2 && (
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Duration</div>
                <DurationChips value={duration} onChange={setDuration} />
              </div>
              <DeliveryTimeSelect timeZone={tz} valueHour={deliveryHour} onChange={setDeliveryHour} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setStep(1)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", flex: 1 }}>Back</button>
                <button type="button" onClick={() => setStep(3)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid transparent", background: "#0f172a", color: "white", cursor: "pointer", flex: 2 }}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 3: Phone + Presets + Advanced + Consent */}
          {step === 3 && (
            <div style={{ display: "grid", gap: 16 }}>
              <label htmlFor="phone" style={{ fontWeight: 600 }}>Mobile number</label>
              <input
                id="phone" type="tel" inputMode="tel" required
                placeholder="(555) 555-5555"
                value={phoneDisplay}
                onChange={(e) => setPhoneDigits(digitsOnly(e.target.value).slice(0, 11))}
                style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
                aria-describedby="smsHelp"
              />
              <p id="smsHelp" style={{ fontSize: 12, color: "#475569", margin: 0 }}>
                Free while in beta. 1 text/day. Msg & data rates may apply. Reply <strong>STOP</strong> to cancel, <strong>HELP</strong> for help.
              </p>

              <div>
                <div style={{ fontWeight: 600, margin: "8px 0" }}>Sport presets</div>
                <SportPresets value={preset} onChange={setPreset} />
              </div>

              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced preferences (optional)</summary>
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  <RangeField label="Min temperature" min={-10} max={80} step={1} value={prefs.tempMin} onChange={(v) => setPrefs((p) => ({ ...p, tempMin: v }))} suffix="°F" />
                  <RangeField label="Max temperature" min={prefs.tempMin} max={100} step={1} value={prefs.tempMax} onChange={(v) => setPrefs((p) => ({ ...p, tempMax: v }))} suffix="°F" />
                  <RangeField label="Max wind" min={0} max={25} step={1} value={prefs.windMax} onChange={(v) => setPrefs((p) => ({ ...p, windMax: v }))} suffix=" mph" />
                  <RangeField label="Max UV" min={0} max={11} step={1} value={prefs.uvMax} onChange={(v) => setPrefs((p) => ({ ...p, uvMax: v }))} />
                  <RangeField label="Max AQI" min={0} max={200} step={5} value={prefs.aqiMax} onChange={(v) => setPrefs((p) => ({ ...p, aqiMax: v }))} />
                </div>
              </details>

              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
                <input required type="checkbox" />
                <span>
                  I agree to receive automated daily texts from ClearSked and accept the{" "}
                  <a href="/terms" style={{ color: "#2563eb" }}>Terms</a> and{" "}
                  <a href="/privacy" style={{ color: "#2563eb" }}>Privacy Policy</a>. Msg freq: 1/day.
                </span>
              </label>

              {submitError && (
                <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 10, borderRadius: 10, fontSize: 14 }}>
                  {submitError}
                </div>
              )}

              {!ok ? (
                <button type="submit" disabled={submitting} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid transparent", background: submitting ? "#64748b" : "#0f172a", color: "white", cursor: submitting ? "not-allowed" : "pointer" }}>
                  {submitting ? "Submitting…" : "Text me my best hour"}
                </button>
              ) : (
                <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#065f46", padding: 12, borderRadius: 10 }}>
                  🎉 You’re in! We’ll text your top window daily at <strong>{deliveryHour}:00 ({tz})</strong>.
                  Share with a friend: <a href="https://clearsked.com/?ref=friend" style={{ color: "#0f172a", fontWeight: 600 }}>clearsked.com</a>
                </div>
              )}

              <div style={{ fontSize: 12, color: "#64748b" }}>Free while in beta. No spam—just your daily window.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setStep(2)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", flex: 1 }}>
                  Back
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Sample panel */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>See a sample</h2>
            <p style={{ margin: "8px 0 0", color: "#475569" }}>
              Your ranges drive a 0–100 comfort score. We penalize “red” minutes instead of excluding them—so you always get a top-scoring window.
            </p>
          </div>
          <SampleChart />
        </div>
      </section>
    </main>
  );
}
