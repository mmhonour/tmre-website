'use client'

import { useState } from 'react'
import { ipPostalNeedsWifiRefine } from '@/lib/visitor-wifi-zip-shared'

const IP_FIXTURE = { postal: '06858', town: 'Norwalk' as const }
const WIFI_FIXTURE = { postal: '06880', town: 'Westport' as const }

export default function HeaderZipWifiPreviewClient() {
  const [step, setStep] = useState<'ip' | 'wifi'>('ip')
  const shown = step === 'ip' ? IP_FIXTURE : WIFI_FIXTURE

  return (
    <div className="min-h-screen bg-cream">
      <div className="navy-gradient px-6 pb-8 pt-28 lg:px-10">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · header ZIP
        </p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-serif text-3xl text-white">
            Wi-Fi ZIP vs ISP ZIP
          </h1>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-navy-dark/95 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/80">
            {shown.postal}
          </span>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
          Fixture only — no listing database. {shown.postal} · {shown.town},
          CT {step === 'ip' ? '(ipapi / ISP block)' : '(Wi-Fi → ZCTA)'}
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Google Search can name Saugatuck / 06880 with Chrome location
          turned off — it uses Google’s own IP and account graph, not the
          device location switch. TMRE’s free IP lookup still lands on unique
          06858. We do not auto-ask Chrome to turn location on. Type the ZIP,
          or tap Use precise location only if you want the browser location
          API (that is what triggers Chrome’s setting prompt).
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          06858 needs refine:{' '}
          {ipPostalNeedsWifiRefine('06858') ? 'yes' : 'no'} · 06880 needs
          refine: {ipPostalNeedsWifiRefine('06880') ? 'yes' : 'no'}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setStep('ip')}
            className={`rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
              step === 'ip'
                ? 'bg-navy text-white'
                : 'border border-charcoal/15 text-navy'
            }`}
          >
            Simulate IP · 06858
          </button>
          <button
            type="button"
            onClick={() => setStep('wifi')}
            className={`rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
              step === 'wifi'
                ? 'bg-navy text-white'
                : 'border border-charcoal/15 text-navy'
            }`}
          >
            Simulate Allow · 06880
          </button>
        </div>
        <p className="mt-8 text-sm text-slate">
          Live header pill does not prompt. Tap it → type a ZIP, or Use
          precise location (only then Chrome may ask to turn location on).
        </p>
      </div>
    </div>
  )
}
