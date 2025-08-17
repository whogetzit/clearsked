// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/* ----------------------------- helpers/types ----------------------------- */

type Prefs = {
  tempMin: number;
  tempMax: number;
  windMax: number;
  uvMax: number;
  aqiMax: number; // optional on backend; kept here for future-proof
};

type SportPresetKey = "running" | "cycling" | "tennis" | "kids";

const SPORT_PRESETS: Record<SportPresetKey, { label: string; prefs: Prefs }> = {
  running: {
    label: "Running",
    prefs: { tempMin: 45, tempMax: 68, windMax: 12, uvMax: 6, aqiMax: 100 },
  },
  cycling: {
    label: "Cycling",
    prefs: { tempMin: 50, tempMax: 72, windMax: 14, uvMax: 7, aqiMax: 100 },
  },
  tennis: {
    label: "Tennis/Pickleball",
    prefs: { tempMin: 55, tempMax: 75, windMax: 10, uvMax: 7, aqiMax: 100 },
  },
  kids: {
    label: "Kids’ Play",
    prefs: { tempMin: 55, tempMax: 80, windMax: 10, uvMax: 5, aqiMax: 80 },
  },
};

const DURATIONS = [30, 45, 60, 90];

function detectLocalTZ() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

function formatPhoneE164US(input: string) {
  // very simple US normalizer -> "+1XXXXXXXXXX" when possible
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return input.trim(); // fallback untouched
}

function isZipValid(zip: string) {
  return /^\d{5}$/.test(zip);
}

/* ------------------------------- components ------------------------------ */

function Chip({
  active,
  children,
  onClick,
  ariaPressed,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  ariaPressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed ?? active}
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

function DurationChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {DURATIONS.map((d) => (
        <Chip key={d} active={value === d} onClick={() => onChange(d)}>
          {d} min
        </Chip>
      ))}
    </div>
  );
}

function SportPresets({
  value,
  onChange,
}: {
  value: SportPresetKey;
  onChange: (k: SportPresetKey) => void;
}) {
  const entries = Object.entries(SPORT_PRESETS) as [SportPresetKey, any][];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {entries.map(([k, v]) => (
        <Chip key={k} active={value === k} onClick={() => onChange(k)}>
          {v.label}
        </Chip>
      ))}
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: "#475569" }}>
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div
        style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}
      >
        <span>
          {min}
          {suffix ?? ""}
        </span>
        <span>
          {max}
          {suffix ?? ""}
        </span>
      </div>
    </label>
  );
}

/** simple inline sample comfort "sparkline" */
function SampleChart() {
  // fake day-of scores (0–100) for illustration
  const scores = [38, 45, 55, 62, 74, 87, 92, 90, 84, 70, 52, 40];
  const width = 360;
  const height = 80;
  const pad = 8;
  const step = (width - pad * 2) / (scores.length - 1);

  const points = scores
    .map((s, i) => {
      const x = pad + i * step;
      const y = height - pad - (s / 100) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
        display: "inline-block",
      }}
    >
      <svg width={width} height={height} role="img" aria-label="Sample comfort chart">
        {/* bands */}
        <rect x={0} y={0} width={width} height={height} fill="#fff" />
        {/* line */}
        <polyline
          fill="none"
          stroke="#0f172a"
          strokeWidth={2}
          points={points}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
        Sample comfort curve — highest score around <strong>6–7am</strong> (Score{" "}
        <strong>92</strong>)
      </div>
    </div>
  );
}

function DeliveryTimeSelect({
  valueHour,
  onChange,
  timeZone,
}: {
  valueHour: number;
  onChange: (h: number) => void;
  timeZone: string;
}) {
  const options = [5, 6, 7];
  function fmt(h: number) {
    // Make a faux date and format in the user's TZ for readability
    try {
      const dtf = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      });
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return dtf.format(d);
    } catch {
      return `${h}:00`;
    }
  }
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 600 }}>Delivery time (your timezone)</span>
      <select
        value={valueHour}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Choose your daily delivery time"
        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
      >
        {options.map((h) => (
          <option key={h} value={h}>
            {fmt(h)} ({timeZone})
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: "#475569" }}>
        Default is 5:00 AM. You can change this anytime later.
      </span>
    </label>
  );
}

/* ------------------------------- main page ------------------------------- */

export default function Page() {
  // progressive form state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [zip, setZip] = useState("");
  const [duration, setDuration] = useState<number>(60);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // presets / prefs
  const [preset, setPreset] = useState<SportPresetKey>("running");
  const [prefs, setPrefs] = useState<Prefs>(SPORT_PRESETS.running.prefs);
  useEffect(() => {
    setPrefs(SPORT_PRESETS[preset].prefs);
  }, [preset]);

  // delivery time / TZ
  const [tz, setTz] = useState("America/Chicago");
  const [deliveryHour, setDeliveryHour] = useState(5);
  useEffect(() => {
    setTz(detectLocalTZ());
  }, []);

  const zipStatus = useMemo(() => {
    if (!zip) return null;
    if (!isZipValid(zip)) return "Enter a 5-digit US ZIP";
    return "Looks good";
  }, [zip]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        zip,
        durationMin: duration,
        phone: formatPhoneE164US(phone),
        deliveryHourLocal: deliveryHour,
        timeZone: tz,
        prefs, // sent as-is; backend can ignore or store in JSON
      };

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Signup failed (${res.status})`);
      }
      setOk(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      {/* Hero */}
      <section style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: 0 }}>
          We text you the best time to train—custom to your weather prefs.
        </h1>
        <p style={{ fontSize: 18, color: "#475569", marginTop: 12 }}>
          Pick your temperature, wind, and UV ranges. We score every minute from{" "}
          <strong>0–100</strong> and text your best window every morning at{" "}
          <strong>5am</strong>.
        </p>

        {/* quick trust bullets */}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "16px 0 0",
            display: "flex",
            gap: 16,
            color: "#334155",
            flexWrap: "wrap",
            fontSize: 14,
          }}
        >
          <li>• No app</li>
          <li>• No login</li>
          <li>• Cancel anytime (text STOP)</li>
        </ul>
      </section>

      {/* CTA + sample */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Progressive form card */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 18,
            display: "grid",
            gap: 16,
          }}
        >
          {/* Step indicator */}
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Step {step} of 3
          </div>

          {/* Step 1: ZIP */}
          {step >= 1 && (
            <div style={{ display: step === 1 ? "grid" : "none", gap: 8 }}>
              <label style={{ fontWeight: 600 }} htmlFor="zip">
                Your ZIP code
              </label>
              <input
                id="zip"
                inputMode="numeric"
                pattern="\d{5}"
                required
                value={zip}
                onChange={(e) => setZip(e.target.value.slice(0, 5))}
                placeholder="e.g., 61550"
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  fontSize: 16,
                }}
                aria-describedby="zipHelp"
              />
              <div id="zipHelp" style={{ fontSize: 12, color: "#475569" }}>
                We’ll personalize your forecast using this location.
              </div>
              <div
                role="status"
                style={{
                  fontSize: 12,
                  color: zipStatus === "Looks good" ? "#16a34a" : "#b91c1c",
                  height: 16,
                }}
              >
                {zipStatus ?? ""}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => isZipValid(zip) && setStep(2)}
                  disabled={!isZipValid(zip)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid transparent",
                    background: isZipValid(zip) ? "#0f172a" : "#cbd5e1",
                    color: "white",
                    cursor: isZipValid(zip) ? "pointer" : "not-allowed",
                    width: "100%",
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Duration + Delivery time */}
          {step >= 2 && (
            <div style={{ display: step === 2 ? "grid" : "none", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Duration
                </div>
                <DurationChips value={duration} onChange={setDuration} />
              </div>

              <DeliveryTimeSelect
                valueHour={deliveryHour}
                onChange={setDeliveryHour}
                timeZone={tz}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid transparent",
                    background: "#0f172a",
                    color: "white",
                    cursor: "pointer",
                    flex: 2,
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Phone + Prefs + Consent */}
          {step >= 3 && (
            <div style={{ display: step === 3 ? "grid" : "none", gap: 16 }}>
              <label style={{ fontWeight: 600 }} htmlFor="phone">
                Mobile number
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                required
                placeholder="(555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  fontSize: 16,
                }}
                aria-describedby="smsHelp"
              />
              <p id="smsHelp" style={{ fontSize: 12, color: "#475569", margin: 0 }}>
                Free while in beta. 1 text/day. Msg & data rates may apply. Reply{" "}
                <strong>STOP</strong> to cancel, <strong>HELP</strong> for help.
              </p>

              {/* Presets */}
              <div>
                <div style={{ fontWeight: 600, margin: "8px 0" }}>
                  Sport presets
                </div>
                <SportPresets value={preset} onChange={setPreset} />
              </div>

              {/* Advanced preferences */}
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  Advanced preferences (optional)
                </summary>
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  <RangeField
                    label="Min temperature"
                    min={-10}
                    max={80}
                    step={1}
                    value={prefs.tempMin}
                    onChange={(v) => setPrefs((p) => ({ ...p, tempMin: v }))}
                    suffix="°F"
                  />
                  <RangeField
                    label="Max temperature"
                    min={prefs.tempMin}
                    max={100}
                    step={1}
                    value={prefs.tempMax}
                    onChange={(v) => setPrefs((p) => ({ ...p, tempMax: v }))}
                    suffix="°F"
                  />
                  <RangeField
                    label="Max wind"
                    min={0}
                    max={25}
                    step={1}
                    value={prefs.windMax}
                    onChange={(v) => setPrefs((p) => ({ ...p, windMax: v }))}
                    suffix=" mph"
                  />
                  <RangeField
                    label="Max UV"
                    min={0}
                    max={11}
                    step={1}
                    value={prefs.uvMax}
                    onChange={(v) => setPrefs((p) => ({ ...p, uvMax: v }))}
                  />
                  <RangeField
                    label="Max AQI"
                    min={0}
                    max={200}
                    step={5}
                    value={prefs.aqiMax}
                    onChange={(v) => setPrefs((p) => ({ ...p, aqiMax: v }))}
                  />
                </div>
              </details>

              {/* Consent */}
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 14,
                }}
              >
                <input required type="checkbox" />
                <span>
                  I agree to receive automated daily texts from ClearSked and
                  accept the{" "}
                  <a href="/terms" style={{ color: "#2563eb" }}>
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" style={{ color: "#2563eb" }}>
                    Privacy Policy
                  </a>
                  . Msg freq varies.
                </span>
              </label>

              {submitError && (
                <div
                  role="alert"
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: 10,
                    borderRadius: 10,
                    fontSize: 14,
                  }}
                >
                  {submitError}
                </div>
              )}

              {!ok ? (
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid transparent",
                    background: submitting ? "#64748b" : "#0f172a",
                    color: "white",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Submitting…" : "Text me my best hour"}
                </button>
              ) : (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #bbf7d0",
                    color: "#065f46",
                    padding: 12,
                    borderRadius: 10,
                  }}
                >
                  🎉 You’re in! We’ll text your top window daily at{" "}
                  <strong>
                    {deliveryHour}:00 ({tz})
                  </strong>
                  . You can reply STOP anytime to cancel.
                </div>
              )}

              <div style={{ fontSize: 12, color: "#64748b" }}>
                Free while in beta. No spam—just your daily window.
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
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
              Here’s how your daily comfort score trends over the morning.
              We’ll mark everything outside your acceptable range as{" "}
              <strong>red</strong> and apply a penalty—so you still get a
              score, even if the day isn’t perfect.
            </p>
          </div>
          <SampleChart />
        </div>
      </section>
    </main>
  );
}
