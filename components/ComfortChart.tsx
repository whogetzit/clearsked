// components/ComfortChart.tsx
import * as React from 'react';

type Props = {
  labels: string[];       // e.g. hour tokens like "2025081911"
  temps: number[];        // same length as labels
  dawnIdx: number;        // index of civil dawn within labels
  duskIdx: number;        // index of civil dusk within labels
  bestStartIdx: number;   // index of "best start" time
  bestEndIdx: number;     // index of "best end" time
  /** Optional heading/subheading for the chart */
  title?: string;
  subtitle?: string;
};

/**
 * Very simple SVG line chart for "comfort" temps with highlighted windows.
 * Replace with your preferred chart lib if you already use one.
 */
export default function ComfortChart({
  labels,
  temps,
  dawnIdx,
  duskIdx,
  bestStartIdx,
  bestEndIdx,
  title,
  subtitle,
}: Props) {
  // Guard empty data
  if (!labels.length || !temps.length || labels.length !== temps.length) {
    return (
      <div className="p-4 border rounded-lg">
        {title && <h3 className="text-lg font-semibold mb-1">{title}</h3>}
        {subtitle && <p className="text-sm text-gray-500 mb-2">{subtitle}</p>}
        <p className="text-sm text-gray-600">No chart data available.</p>
      </div>
    );
  }

  // Basic layout
  const w = 800;
  const h = 260;
  const padding = 32;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;

  // Scales
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const y = (t: number) =>
    padding + innerH - ((t - minTemp) / Math.max(1, maxTemp - minTemp)) * innerH;
  const x = (i: number) => padding + (i / Math.max(1, temps.length - 1)) * innerW;

  // Path
  const pathD = temps
    .map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(t)}`)
    .join(' ');

  // Ranges
  const clampIdx = (i: number) => Math.max(0, Math.min(temps.length - 1, i));
  const dawnX = x(clampIdx(dawnIdx));
  const duskX = x(clampIdx(duskIdx));
  const bestStartX = x(clampIdx(bestStartIdx));
  const bestEndX = x(clampIdx(bestEndIdx));

  return (
    <div className="p-4 border rounded-lg bg-white">
      {title && <h3 className="text-lg font-semibold mb-1">{title}</h3>}
      {subtitle && <p className="text-sm text-gray-500 mb-2">{subtitle}</p>}

      <svg width={w} height={h} role="img" aria-label={title ?? 'Comfort chart'}>
        {/* Axes (very minimal) */}
        <line x1={padding} y1={padding} x2={padding} y2={h - padding} stroke="currentColor" opacity={0.2} />
        <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="currentColor" opacity={0.2} />

        {/* Daylight band */}
        <rect
          x={Math.min(dawnX, duskX)}
          y={padding}
          width={Math.abs(duskX - dawnX)}
          height={innerH}
          fill="currentColor"
          opacity={0.06}
        />

        {/* Best window band */}
        <rect
          x={Math.min(bestStartX, bestEndX)}
          y={padding}
          width={Math.abs(bestEndX - bestStartX)}
          height={innerH}
          fill="currentColor"
          opacity={0.1}
        />

        {/* Temperature line */}
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth={2} />

        {/* Points */}
        {temps.map((t, i) => (
          <circle key={i} cx={x(i)} cy={y(t)} r={2} fill="currentColor" opacity={0.85} />
        ))}

        {/* Min/Max labels */}
        <text x={padding + 6} y={y(maxTemp) - 6} fontSize={12} fill="currentColor" opacity={0.6}>
          {Math.round(maxTemp)}°
        </text>
        <text x={padding + 6} y={y(minTemp) + 14} fontSize={12} fill="currentColor" opacity={0.6}>
          {Math.round(minTemp)}°
        </text>
      </svg>

      {/* Simple legend */}
      <div className="mt-2 text-xs text-gray-600 flex gap-4 flex-wrap">
        <span><span className="inline-block align-middle w-3 h-3 mr-1" style={{ background: 'currentColor', opacity: 0.06 }} /> Daylight</span>
        <span><span className="inline-block align-middle w-3 h-3 mr-1" style={{ background: 'currentColor', opacity: 0.1 }} /> Best window</span>
        <span>Points/line: temperature</span>
      </div>
    </div>
  );
}
