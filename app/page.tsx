// app/page.tsx
'use client';

import React from 'react';

export default function HomePage() {
  const [zip, setZip] = React.useState('');
  const [duration, setDuration] = React.useState(60);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const isValidZip = /^\d{5}$/.test(zip);
  const isValidDuration = duration >= 15 && duration <= 240;
  const canSubmit = isValidZip && isValidDuration && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip, durationMin: duration }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Signup failed');

      setResult({
        ok: true,
        message: `Success! Your ID: ${data.id}. Check your settings to add a phone number for SMS alerts.`,
      });
      setZip('');
      setDuration(60);
    } catch (err: any) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center text-lg">
              CS
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">ClearSked</h1>
              <p className="text-sm text-slate-500">Find your perfect outdoor window</p>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Never miss a perfect day
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-4">
            ClearSked analyzes 24-hour weather forecasts and finds your ideal window for outdoor activities. Set your comfort preferences and get daily alerts for the best times.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 mb-12">
          {/* Features */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-slate-900">How it works</h3>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-sky-100 text-sky-600 font-semibold">
                    1
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">Set your preferences</h4>
                  <p className="text-slate-600 text-sm">
                    Define your ideal temperature, humidity, wind, UV, cloud cover, and air quality ranges.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-sky-100 text-sky-600 font-semibold">
                    2
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">We score every minute</h4>
                  <p className="text-slate-600 text-sm">
                    Our algorithm scores each minute of tomorrow's forecast from 0–100 based on your preferences.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-sky-100 text-sky-600 font-semibold">
                    3
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">Get your best window</h4>
                  <p className="text-slate-600 text-sm">
                    We identify your best continuous window and send it to you every morning before dawn.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 text-sm text-slate-600">
              <p>
                <strong>Perfect for:</strong> Running • Cycling • Hiking • Photography • Outdoor Training • Gardening • Events
              </p>
            </div>
          </div>

          {/* Signup Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Get started</h3>
            <p className="text-slate-600 text-sm mb-6">
              Enter your ZIP code and we'll show you tomorrow's best window.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="zip" className="block text-sm font-medium text-slate-700 mb-2">
                  ZIP Code
                </label>
                <input
                  id="zip"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="e.g. 80487"
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                {zip && isValidZip && (
                  <p className="mt-1 text-xs text-emerald-600 font-medium">✓ Valid ZIP</p>
                )}
              </div>

              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-slate-700 mb-2">
                  Session Duration (minutes)
                </label>
                <input
                  id="duration"
                  type="number"
                  min={15}
                  max={240}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-slate-500">Minimum 15 min, maximum 240 min</p>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg bg-sky-600 text-white font-semibold py-2.5 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Signing up...' : 'Get My First Window'}
              </button>

              {result && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    result.ok
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {result.message}
                </div>
              )}
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                📱 <strong>SMS alerts:</strong> Add your phone in your account to receive daily text notifications.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-slate-50 border-t border-b border-slate-200 py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h3 className="text-2xl font-bold text-slate-900 mb-8 text-center">Customizable preferences</h3>

          <div className="grid gap-4 md:grid-cols-4 text-center">
            <div className="p-4">
              <p className="text-3xl mb-2">🌡️</p>
              <h4 className="font-semibold text-slate-900">Temperature</h4>
              <p className="text-sm text-slate-600">Range: –40°F to 110°F</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">💨</p>
              <h4 className="font-semibold text-slate-900">Wind</h4>
              <p className="text-sm text-slate-600">Range: 0–30 mph</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">☀️</p>
              <h4 className="font-semibold text-slate-900">UV Index</h4>
              <p className="text-sm text-slate-600">Range: 0–11+</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">💧</p>
              <h4 className="font-semibold text-slate-900">Humidity & Rain</h4>
              <p className="text-sm text-slate-600">Precipitation & clouds</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">🌫️</p>
              <h4 className="font-semibold text-slate-900">Cloud Cover</h4>
              <p className="text-sm text-slate-600">Range: 0–100%</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">🌾</p>
              <h4 className="font-semibold text-slate-900">Air Quality</h4>
              <p className="text-sm text-slate-600">AQI scoring</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">📅</p>
              <h4 className="font-semibold text-slate-900">Schedule</h4>
              <p className="text-sm text-slate-600">Pick your delivery time</p>
            </div>
            <div className="p-4">
              <p className="text-3xl mb-2">🗺️</p>
              <h4 className="font-semibold text-slate-900">Location</h4>
              <p className="text-sm text-slate-600">Zip code based forecast</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
        <h3 className="text-2xl font-bold text-slate-900 mb-8">Questions?</h3>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Is it free?</h4>
            <p className="text-slate-600 text-sm">
              Yes, ClearSked is completely free. We're still in beta and may add premium features later.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Do I need a phone number?</h4>
            <p className="text-slate-600 text-sm">
              Nope! You can sign up with just a ZIP code. Add a phone later if you want SMS alerts.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">When do I get the alert?</h4>
            <p className="text-slate-600 text-sm">
              We send forecasts every morning before sunrise so you have time to plan your day.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">How accurate is the forecast?</h4>
            <p className="text-slate-600 text-sm">
              We use hourly weather data and score each minute based on your exact preferences.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-600">
            <p>© {new Date().getFullYear()} ClearSked. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="/privacy" className="hover:text-slate-900">
                Privacy
              </a>
              <a href="/terms" className="hover:text-slate-900">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
