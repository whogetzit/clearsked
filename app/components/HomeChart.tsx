// app/components/HomeChart.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  /** Labels like ["7a","8a","9a", ...] */
  labels: string[];
  /** Temperatures per label (null to show gaps) */
  temps: Array<number | null>;
  /** Indices for civil dawn/dusk dashed lines (0-based, clamped internally) */
  dawnIdx: number;
  duskIdx: number;
  /** Best window highlight box (inclusive indices, clamped internally) */
  bestStartIdx: number;
  bestEndIdx: number;

  /** Title lines (e.g., ["ClearSked — 61550", "Mon, Aug 18"]) */
  titleLines?: string[];
  /** Subtitle (e.g., "Best 60m 7:00–8:00 (Score 92) • Civil 6:11–7:50") */
  subtitle?: string;
  /** Optional width/height for canvas container */
  width?: number;
  height?: number;
};

export default function HomeChart({
  labels,
  temps,
  dawnIdx,
  duskIdx,
  bestStartIdx,
  bestEndIdx,
  titleLines = [],
  subtitle = '',
  width = 900,
  height = 450,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Dynamic imports only in the browser
  const loader = useMemo(
    () => async () => {
      const [{ default: Chart }, { default: annotationPlugin }] = await Promise.all([
        import('chart.js/auto'),
        import('chartjs-plugin-annotation'),
      ]);
      Chart.register(annotationPlugin);
      return Chart;
    },
    []
  );

  useEffect(() => {
    let destroyed = false;
    let chart: any;

    (async () => {
      try {
        const Chart = await loader();
        if (destroyed) return;

        const _dawn = clamp(dawnIdx, 0, labels.length - 1);
        const _dusk = clamp(duskIdx, 0, labels.length - 1);
        const _b0 = clamp(bestStartIdx, 0, labels.length - 1);
        const _b1 = clamp(bestEndIdx, _b0, labels.length - 1);

        const cfg = {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Temp °F',
                data: temps,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 0,
                fill: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: {
                display: titleLines.length > 0,
                text: titleLines,
                color: '#0f172a',
                font: { size: 16, weight: '600' },
                padding: { top: 8, bottom: 4 },
              },
              subtitle: {
                display: !!subtitle,
                text: subtitle,
                color: '#334155',
                font: { size: 12 },
                padding: { bottom: 8 },
              },
              annotation: {
                annotations: {
                  dawnLine: {
                    type: 'line',
                    xMin: _dawn,
                    xMax: _dawn,
                    borderColor: 'rgba(2,6,23,0.5)', // slate-950 @ 50%
                    borderWidth: 2,
                    borderDash: [6, 6],
                  },
                  duskLine: {
                    type: 'line',
                    xMin: _dusk,
                    xMax: _dusk,
                    borderColor: 'rgba(2,6,23,0.5)',
                    borderWidth: 2,
                    borderDash: [6, 6],
                  },
                  bestBox: {
                    type: 'box',
                    xMin: _b0,
                    xMax: _b1,
                    backgroundColor: 'rgba(16, 185, 129, 0.18)', // emerald-500 @ 18%
                    borderWidth: 0,
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#334155' },
              },
              y: {
                grid: { color: 'rgba(148, 163, 184, 0.18)' },
                ticks: {
                  color: '#334155',
                  callback: (v: any) => `${v}°`,
                },
              },
            },
          },
        } as any;

        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) {
          setErr('Canvas context not available');
          return;
        }

        chart = new Chart(ctx, cfg);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load chart libraries');
      }
    })();

    return () => {
      destroyed = true;
      try {
        chart?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [labels, temps, dawnIdx, duskIdx, bestStartIdx, bestEndIdx, titleLines, subtitle, loader]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: width,
        height,
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        background: 'white',
        padding: 8,
      }}
    >
      {err ? (
        <div
          style={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: '#b91c1c',
            background: '#fff1f2',
            border: '1px dashed #fecaca',
            borderRadius: 8,
          }}
        >
          Chart error: {err}
        </div>
      ) : (
        <canvas ref={canvasRef} />
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
