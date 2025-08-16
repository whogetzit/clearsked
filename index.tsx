import React, { useState } from "react";

const isUSZip = (v:string) => /^(\d{5})(?:-\d{4})?$/.test(String(v||"").trim());
const digits = (v:string) => String(v||"").replace(/\D/g,"");
const formatPhone = (v:string) => { const d=digits(v).slice(0,11); const c=d.startsWith("1")?d.slice(1):d; const a=c.slice(0,3), b=c.slice(3,6), x=c.slice(6,10); if(x) return `(${a}) ${b}-${x}`; if(b) return `(${a}) ${b}`; if(a) return `(${a}`; return ""; };
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const normalizePair=(value:any,min:number,max:number)=>{ let lo:number,hi:number; if(!Array.isArray(value)||value.length<2){lo=min;hi=max;} else {lo=Number(value[0]);hi=Number(value[1]);} if(!Number.isFinite(lo)) lo=min; if(!Number.isFinite(hi)) hi=max; if(lo>hi)[lo,hi]=[hi,lo]; return [clamp(lo,min,max),clamp(hi,min,max)] as [number,number]; };

const DualRange: React.FC<{label:string; min:number; max:number; step?:number; value:[number,number]; onChange:(v:[number,number])=>void; format?:(x:number)=>string;}> = ({ label, min, max, step=1, value, onChange, format=(x)=>String(x) }) => {
  const [lo, hi] = normalizePair(value, min, max);
  const pct = (v:number)=> ((v-min)*100)/(max-min);
  const updateLo = (v:number|string)=> onChange([Math.min(clamp(Number(v), min, hi), hi), hi]);
  const updateHi = (v:number|string)=> onChange([lo, Math.max(clamp(Number(v), lo, max), lo)]);
  const lowStyle   = { zIndex: 20 as const, left: 0, width: `${pct(hi)}%` };
  const highStyle  = { zIndex: 10 as const, left: `${pct(lo)}%`, width: `${100 - pct(lo)}%` };
  return (<div className="space-y-1">
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="tabular-nums text-slate-600">{format(lo)} – {format(hi)}</span>
    </div>
    <div className="relative h-9 select-none">
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded bg-slate-200" />
      <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-sky-300 rounded" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
      <input aria-label={`${label} min`} type="range" min={min} max={hi} step={step} value={lo} onChange={(e)=>updateLo(e.target.value)} className="absolute appearance-none bg-transparent h-9" style={lowStyle as any} />
      <input aria-label={`${label} max`} type="range" min={lo} max={max} step={step} value={hi} onChange={(e)=>updateHi(e.target.value)} className="absolute appearance-none bg-transparent h-9" style={highStyle as any} />
    </div>
  </div>);
};

const BandControls: React.FC<{title:string; unit?:string; min:number; max:number; step?:number; bands:{green:[number,number]; yellow:[number,number]}; setBands:(fn:(b:any)=>any)=>void;}> = ({ title, unit, min, max, step=1, bands, setBands }) => {
  const fmt=(x:number)=> unit?`${x}${unit}`:String(x);
  const onGreen=(v:[number,number])=>{ const g=normalizePair(v,min,max), y=normalizePair(bands.yellow,min,max); setBands((b:any)=>({...b, green:[Math.max(g[0],y[0]), Math.min(g[1],y[1])]})); };
  const onYellow=(v:[number,number])=>{ const y=normalizePair(v,min,max), g=normalizePair(bands.green,min,max); setBands((b:any)=>({...b, yellow:[Math.min(y[0],g[0]), Math.max(y[1],g[1])]})); };
  return (<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
    <DualRange label="🟢 Green range" min={min} max={max} step={step} value={bands?.green as any} onChange={onGreen} format={fmt} />
    <div className="mt-3" />
    <DualRange label="🟡 Yellow range" min={min} max={max} step={step} value={bands?.yellow as any} onChange={onYellow} format={fmt} />
    <p className="mt-2 text-xs text-slate-500">🔴 Red is anything outside yellow. Red minutes are penalized in scoring.</p>
  </div>);
};

export default function Landing(){
  const [zip,setZip]=useState("");
  const [duration,setDuration]=useState<number|string>(45);
  const [phone,setPhone]=useState("");
  const [consent,setConsent]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [result,setResult]=useState<{ok:boolean; message:string}|null>(null);

  const [bands,setBands]=useState<any>({
    temp:{green:[60,68], yellow:[50,78]},
    humidity:{green:[30,45], yellow:[20,65]},
    wind:{green:[0,5], yellow:[0,12]},
    uv:{green:[2,4], yellow:[0,6]},
    cloud:{green:[10,40], yellow:[0,80]},
    precip:{green:[0,10], yellow:[0,40]},
    aqi:{green:[0,50], yellow:[0,100]},
  });

  const phoneDigits = digits(phone);
  const phoneValid = phoneDigits.length===10 || (phoneDigits.length===11 && phoneDigits.startsWith("1"));
  const zipValid = isUSZip(zip);
  const durationValid = Number(duration)>=15 && Number(duration)<=180;
  const formValid = zipValid && phoneValid && durationValid && consent;

  const onSubmit = async (e:any)=>{
    e.preventDefault(); if(!formValid) return; setSubmitting(true); setResult(null);
    try{
      const res = await fetch("/api/signup", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ zip, duration: Number(duration), phone: phoneDigits, prefs: { bands } }) });
      const data = await res.json(); if(!res.ok) throw new Error(data?.message||"Failed to sign up");
      setResult({ ok:true, message: data.message || "You’re in! We’ll text you each morning at 5am." });
      setZip(""); setDuration(45); setPhone(""); setConsent(false);
    }catch(err:any){ setResult({ ok:false, message: err.message }); }
    finally{ setSubmitting(false); }
  };

  return (<div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
    <div className="w-full bg-black text-white text-center text-sm py-2"><span className="font-semibold">Built by ChatGPT‑5 Thinking</span></div>
    <header className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-slate-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-xl bg-sky-600 text-white grid place-items-center font-bold">CS</div><span className="font-semibold text-slate-900">ClearSked</span></div>
        <span className="text-xs"><span className="rounded-full bg-slate-100 px-2 py-1">Built by ChatGPT‑5</span></span>
      </div>
    </header>

    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-10 md:grid-cols-2 md:py-16">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">Your perfect outdoor window — tuned to your bands.</h1>
        <p className="mt-4 max-w-prose text-slate-600">Set 🟢 ideal and 🟡 acceptable ranges for temperature, humidity, wind, UV, clouds, precipitation, and AQI. We’ll mark everything outside as 🔴 and apply a penalty instead of excluding it.</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-md">
        <div className="h-36 w-full rounded-2xl bg-sky-50 grid place-items-center text-sky-700">Sample comfort curve</div>
        <div className="mt-3 text-right text-xs text-slate-500">Comfort score (0–100)</div>
      </div>
    </section>

    <section id="signup" className="mx-auto max-w-5xl px-4 pb-16">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BandControls title="Temperature (°F)" unit="°" min={-10} max={110} step={1} bands={bands.temp} setBands={(v)=>setBands((b:any)=>({...b, temp:v}))} />
        <BandControls title="Humidity (%)" unit="%" min={0} max={100} step={1} bands={bands.humidity} setBands={(v)=>setBands((b:any)=>({...b, humidity:v}))} />
        <BandControls title="Wind (mph)" min={0} max={30} step={1} bands={bands.wind} setBands={(v)=>setBands((b:any)=>({...b, wind:v}))} />
        <BandControls title="UV Index" min={0} max={11} step={0.5} bands={bands.uv} setBands={(v)=>setBands((b:any)=>({...b, uv:v}))} />
        <BandControls title="Cloud Cover (%)" unit="%" min={0} max={100} step={1} bands={bands.cloud} setBands={(v)=>setBands((b:any)=>({...b, cloud:v}))} />
        <BandControls title="Precip Chance (%)" unit="%" min={0} max={100} step={1} bands={bands.precip} setBands={(v)=>setBands((b:any)=>({...b, precip:v}))} />
        <BandControls title="Air Quality (AQI)" min={0} max={200} step={1} bands={bands.aqi} setBands={(v)=>setBands((b:any)=>({...b, aqi:v}))} />
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-md">
        <h2 className="text-2xl font-bold text-slate-900">Start my daily alerts</h2>
        <p className="mt-1 text-sm text-slate-600">Free while in beta. Texts arrive at 5:00 AM Central.</p>
        <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div><label htmlFor="zip" className="block text-sm font-medium text-slate-700">ZIP code</label><input id="zip" inputMode="numeric" placeholder="61550" value={zip} onChange={(e)=>setZip(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></div>
          <div><label htmlFor="duration" className="block text-sm font-medium text-slate-700">Duration (minutes)</label><input id="duration" type="number" min={15} max={180} value={duration} onChange={(e)=>setDuration(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></div>
          <div><label htmlFor="phone" className="block text-sm font-medium text-slate-700">Phone</label><input id="phone" type="tel" placeholder="(309) 555‑1212" value={formatPhone(phone)} onChange={(e)=>setPhone(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></div>
          <div className="col-span-1 md:col-span-3"><label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300" checked={consent} onChange={(e)=>setConsent(e.target.checked)} /><span>I agree to receive automated daily texts from ClearSked. Message/data rates may apply. Reply STOP to cancel.</span></label></div>
          <div className="col-span-1 md:col-span-3 flex items-center justify-between gap-3"><div className="text-xs text-slate-500">By continuing you agree to our <a className="underline" href="#">Terms</a> and <a className="underline" href="#">Privacy</a>.</div><button type="submit" disabled={!formValid || submitting} className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60">{submitting?"Signing up…":"Start My Free Alerts"}</button></div>
        </form>
        {result && (<div className={`mt-4 rounded-2xl border p-3 text-sm ${result.ok?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-rose-200 bg-rose-50 text-rose-800"}`}>{result.message}</div>)}
      </div>
    </section>

    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-slate-500 md:flex-row">
        <div>© {new Date().getFullYear()} ClearSked · <span className="font-medium text-slate-700">Built by ChatGPT‑5 Thinking</span></div>
        <div className="flex items-center gap-4"><a href="#" className="hover:text-sky-700">Privacy</a><a href="#" className="hover:text-sky-700">Terms</a><a href="#signup" className="hover:text-sky-700">Get alerts</a></div>
      </div>
    </footer>
  </div>);
}
