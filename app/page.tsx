// app/page.tsx
'use client';

import * as React from 'react';

export default function Page() {
  const [zip, setZip] = React.useState('80487');

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero */}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
          We text you the best time to train—custom to your weather prefs.
        </h1>
        <p className="mt-3 text-gray-600 max-w-3xl">
          Pick your temperature, wind, UV, humidity and more. We score every minute from <strong>0–100</strong> and text your best window every morning.
        </p>
        <p className="mt-2 text-sm text-gray-500">• No app • No login • Cancel anytime (text STOP)</p>

        {/* Content */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {/* Step card */}
          <div className="rounded-xl border border-gray-200 p-4 md:col-span-1">
            <p className="text-sm font-medium text-gray-700">Step 1 of 3</p>
            <label className="mt-4 block text-sm font-medium text-gray-900">
              Your ZIP code
              <input
                inputMode="numeric"
                maxLength={5}
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="e.g. 80487"
              />
            </label>
            <p className="mt-2 text-sm text-gray-600">
              We’ll personalize your forecast using this location.
            </p>
            <p className="mt-1 text-sm text-emerald-600">
              {zip === '80487' ? 'Steamboat Springs, CO (80487)' : zip ? `ZIP ${zip}` : ''}
            </p>
            <button
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-900"
              type="button"
              onClick={() => {/* continue to next step (wire up later) */}}
            >
              Continue
            </button>
          </div>

          {/* Preview */}
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900">Preview for your settings</h2>
            <p className="text-sm text-gray-600">
              Dashed lines show <strong>civil dawn &amp; dusk</strong>. Green bar = your best <strong>60 min</strong> window (always inside daylight).
            </p>

            <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
              {/* Simple inline SVG chart preview (static sample) */}
              <svg viewBox="0 0 800 250" className="w-full h-[220px]">
                {/* axes */}
                <line x1="40" y1="20" x2="40" y2="210" stroke="#000" opacity="0.15" />
                <line x1="40" y1="210" x2="780" y2="210" stroke="#000" opacity="0.15" />

                {/* daylight band */}
                <rect x="120" y="20" width="560" height="190" fill="#10b981" opacity="0.06" />
