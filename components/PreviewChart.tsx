// components/PreviewChart.tsx
"use client";

import * as React from "react";

type Point = { tUTC: number; score: number };

export default function PreviewChart(props: {
  timeZone: string;
  series: Point[];
  dawnUTC: string;
  duskUTC: string;
  bestStartUTC?: string;
  bestEndUTC?: string;
  dawnLabel: string;
  duskLabel: string;
  bestLabel: string; // e.g., "Best 60min: 5:42–6:42 (Score 84)"
}) {
  const { timeZone, series, dawnUTC, duskUTC, bestStartUTC, bestEndUTC, dawnLabel, duskLabel, bestLabel } = props;

  // helpers to convert UTC epoch → minutes after local midnight
  const toLocalHM = React.useCallback((epoch: number) => {
    const dt = new Date(epoch);
    const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(dt);
    const minute = new Intl.DateTimeFormat("en-US", { minute: "2-digit", timeZone }).format(dt);
    const h = Number(hour);
    const m = Number(minute);
    return h * 60 + m;
  }, [timeZone]);

  const width = 720, height = 200, pad = 24;
  const xFromMin = (mins: number) => pad + (mins / 1440) * (width - pad * 2);
  const yFromScore = (s: number) => height - pad - (s / 100) * (height - pad * 2);

  const poly = React.useMemo(() => {
    return series.map(p => `${xFromMin(toLocalHM(p.tUTC))},${yFromScore(p.score)}`).join(" ");
  }, [series, toLocalHM]);

  const dawnX = xFromMin(toLocalHM(Date.parse(dawnUTC)));
  const duskX = xFromMin(toLocalHM(Date.parse(duskUTC)));
  const bestStartX = bestStartUTC ? xFromMin(toLocalHM(Date.parse(bestStartUTC))) : undefined;
  const bestEndX = bestEndUTC ? xFromMin(toLocalHM(Date.parse(bestEndUTC))) : undefined;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
      <svg width={width} height={height} role="img" aria-label="Comfort score preview">
        {/* grid bands */}
        <rect x={0} y={0} width={width} height={height} fill="#fff" />
        <rect x={pad} y={pad} width={width - pad * 2} height={(height - pad * 2) / 3} fill="#dcfce7" opacity={0.35} />
        <rect x={pad} y={pad + (height - pad * 2) / 3} width={width - pad * 2} height={(height - pad * 2) / 3} fill="#fef3c7" opacity={0.35} />
        <rect x={pad} y={pad + ((height - pad * 2) / 3) * 2} width={width - pad * 2} height={(height - pad * 2) / 3} fill="#fee2e2" opacity={0.35} />

        {/* best window highlight */}
        {bestStartX !== undefined && bestEndX !== undefined && (
          <rect x={bestStartX} y={pad} width={Math.max(2, bestEndX - bestStartX)} height={height - pad * 2}
                fill="#22c55e" opacity={0.12} />
        )}

        {/* dawn/dusk dashed lines */}
        <line x1={dawnX} x2={dawnX} y1={pad} y2={height - pad} stroke="black" strokeDasharray="5,5" />
        <line x1={duskX} x2={duskX} y1={pad} y2={height - pad} stroke="black" strokeDasharray="5,5" />

        {/* series polyline */}
        <polyline fill="none" stroke="#0f172a" strokeWidth={2} points={poly} />

        {/* axis labels */}
        {[0, 6, 12, 18, 24].map(h => {
          const x = xFromMin(h * 60);
          return (
            <g key={h}>
              <line x1={x} x2={x} y1={height - pad} y2={height - pad + 4} stroke="#94a3b8" />
              <text x={x} y={height - 4} textAnchor="middle" fontSize="10" fill="#475569">{h}:00</text>
            </g>
          );
        })}

        {/* labels for dawn/dusk & best */}
        <text x={Math.min(dawnX + 4, width - 4)} y={pad + 10} fontSize="10" fill="#475569" transform={`rotate(90 ${dawnX + 4} ${pad + 10})`}>
          {`dawn ${dawnLabel}`}
        </text>
        <text x={Math.min(duskX + 4, width - 4)} y={pad + 10} fontSize="10" fill="#475569" transform={`rotate(90 ${duskX + 4} ${pad + 10})`}>
          {`dusk ${duskLabel}`}
        </text>
        {bestStartX !== undefined && bestEndX !== undefined && (
          <text x={(bestStartX + bestEndX) / 2} y={pad + 12} fontSize="11" fill="#065f46" textAnchor="middle">
            {bestLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
