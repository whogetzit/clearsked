// lib/scoring.ts
export type MinuteConditions = {
  time: Date;            // JS Date in UTC
  tempF?: number;
  windMph?: number;
  uvIndex?: number;
  aqi?: number;          // US AQI 0–500
  humidityPct?: number;  // 0–100
  cloudPct?: number;     // 0–100
  precipChancePct?: number; // 0–100
};

export type Prefs = {
  tempMin?: number;
  tempMax?: number;
  windMax?: number;
  uvMax?: number;
  aqiMax?: number;
  humidityMax?: number;
  cloudCoverMax?: number;
  precipChanceMax?: number;
};

// Defaults used if a slider isn’t provided
const DEFAULTS: Required<Prefs> = {
  tempMin: 45, tempMax: 68,
  windMax: 12,
  uvMax: 6,
  aqiMax: 100,
  humidityMax: 85,
  cloudCoverMax: 100,
  precipChanceMax: 30,
};

// Penalty helpers: value inside limit => 1; outside => decays exponentially
const expPenalty = (delta: number, k: number) => Math.exp(-Math.max(0, delta) * k);

export function scoreMinute(c: MinuteConditions, prefsIn: Prefs = {}): number {
  const p = { ...DEFAULTS, ...prefsIn };

  // Temperature: no penalty inside band; outside penalize per °F
  let tempScore = 1;
  if (typeof c.tempF === "number") {
    if (c.tempF < p.tempMin) tempScore = expPenalty(p.tempMin - c.tempF, 0.08);
    else if (c.tempF > p.tempMax) tempScore = expPenalty(c.tempF - p.tempMax, 0.08);
  }

  // Wind (mph): higher than max => penalty
  const windScore =
    typeof c.windMph === "number" ? expPenalty((c.windMph ?? 0) - p.windMax, 0.12) : 1;

  // UV: higher than max => penalty
  const uvScore =
    typeof c.uvIndex === "number" ? expPenalty((c.uvIndex ?? 0) - p.uvMax, 0.35) : 1;

  // AQI: higher than max => penalty (AQI scale is wide, use small k)
  const aqiScore =
    typeof c.aqi === "number" ? expPenalty((c.aqi ?? 0) - p.aqiMax, 0.03) : 1;

  // Humidity %: higher than max => penalty
  const humidityScore =
    typeof c.humidityPct === "number" ? expPenalty((c.humidityPct ?? 0) - p.humidityMax, 0.04) : 1;

  // Cloud cover %: higher than max => penalty
  const cloudScore =
    typeof c.cloudPct === "number" ? expPenalty((c.cloudPct ?? 0) - p.cloudCoverMax, 0.03) : 1;

  // Precip chance %: higher than max => penalty (steeper)
  const precipScore =
    typeof c.precipChancePct === "number" ? expPenalty((c.precipChancePct ?? 0) - p.precipChanceMax, 0.06) : 1;

  // Weighted geometric mean keeps any “red” factor impactful but not binary
  const weights = {
    temp: 0.30,
    wind: 0.18,
    uv: 0.12,
    aqi: 0.12,
    humidity: 0.12,
    cloud: 0.08,
    precip: 0.08,
  };

  const wlog =
    weights.temp * Math.log(tempScore || 1e-6) +
    weights.wind * Math.log(windScore || 1e-6) +
    weights.uv * Math.log(uvScore || 1e-6) +
    weights.aqi * Math.log(aqiScore || 1e-6) +
    weights.humidity * Math.log(humidityScore || 1e-6) +
    weights.cloud * Math.log(cloudScore || 1e-6) +
    weights.precip * Math.log(precipScore || 1e-6);

  const geo = Math.exp(wlog);        // 0..1
  return Math.round(geo * 100);      // 0..100
}

export function averageScore(points: MinuteConditions[], prefs: Prefs): number {
  if (!points.length) return 0;
  const sum = points.reduce((acc, m) => acc + scoreMinute(m, prefs), 0);
  return Math.round(sum / points.length);
}
