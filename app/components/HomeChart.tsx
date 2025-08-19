// app/components/HomeChart.tsx
'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend, annotationPlugin);

type Props = {
  labels: string[];
  temps: (number | null)[];
  dawnIdx: number;
  duskIdx: number;
  bestStartIdx: number;
  bestEndIdx: number;
  title: string;      // "ClearSked — 61550"
  subtitle: string;   // "Mon, Aug 18 • Best 60m …"
};

export default function HomeChart(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const cfg: any = {
      type: 'line',
      data: {
        labels: props.labels,
        datasets: [{
          label: 'Temp °F',
          data: props.temps,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 0,
          fill: false,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: props.title,
            color: '#0f172a',
            font: { size: 18, weight: '700' },
            padding: { bottom: 4 },
          },
          subtitle: {
            display: true,
            text: props.subtitle,
            color: '#334155',
            font: { size: 12 },
            padding: { bottom: 8 },
          },
          annotation: {
            annotations: {
              dawnLine: {
                type: 'line',
                xMin: props.dawnIdx, xMax: props.dawnIdx,
                borderColor: 'rgba(2,6,23,0.5)',
                borderWidth: 2,
                borderDash: [6, 6],
              },
              duskLine: {
                type: 'line',
                xMin: props.duskIdx, xMax: props.duskIdx,
                borderColor: 'rgba(2,6,23,0.5)',
                borderWidth: 2,
                borderDash: [6, 6],
              },
              bestBox: {
                type: 'box',
                xMin: props.bestStartIdx, xMax: props.bestEndIdx,
                backgroundColor: 'rgba(16, 185, 129, 0.18)',
                borderWidth: 0,
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#334155' } },
          y: { grid: { color: 'rgba(148, 163, 184, 0.18)' }, ticks: { color: '#334155' } },
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, cfg);
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [props]);

  return (
    <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
      <canvas ref={canvasRef} aria-label="Temperature chart" />
    </div>
  );
}
