'use client'

import { useState } from 'react'
import VisitorLocationBadge from '@/components/VisitorLocationBadge'
import { ipPostalNeedsWifiRefine } from '@/lib/visitor-wifi-zip-shared'

const IP_FIXTURE = { postal: '06858', town: 'Norwalk' as const }
const WIFI_FIXTURE = { postal: '06880', town: 'Westport' as const }

export default function HeaderZipWifiPreviewClient() {
  const [step, setStep] = useState<'ip' | 'wifi'>('ip')
  const [audience, setAudience] = useState<'visitor' | 'admin'>('visitor')
  const shown = step === 'ip' ? IP_FIXTURE : WIFI_FIXTURE
  const admin = audience === 'admin'

  return (
    <div className="min-h-screen bg-cream">
      <div className="navy-gradient px-6 pb-8 pt-28 lg:px-10">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · header ZIP
        </p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-serif text-3xl text-white">
            Header ZIP pill
          </h1>
          <VisitorLocationBadge
            visible={admin}
            showPreciseLocation={admin}
          />
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
          What changed: the ZIP pill is hidden for visitors. Admin (site
          password) still sees it. Fixture {shown.postal} · {shown.town}, CT
          — no listing database.
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Toggle Visitor / Admin. The live pill in this header appears only
          in Admin. Use precise location stays on that admin dialog.
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          06858 needs refine:{' '}
          {ipPostalNeedsWifiRefine('06858') ? 'yes' : 'no'} · 06880 needs
          refine: {ipPostalNeedsWifiRefine('06880') ? 'yes' : 'no'}
        </p>
        <div className="mb-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setAudience('visitor')}
            className={`rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
              audience === 'visitor'
                ? 'bg-navy text-white'
                : 'border border-charcoal/15 text-navy'
            }`}
          >
            Visitor — no ZIP pill
          </button>
          <button
            type="button"
            onClick={() => setAudience('admin')}
            className={`rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
              audience === 'admin'
                ? 'bg-navy text-white'
                : 'border border-charcoal/15 text-navy'
            }`}
          >
            Admin — ZIP pill on
          </button>
        </div>
        {admin ? (
          <ZipDialogFixture postal={shown.postal} />
        ) : (
          <p className="text-sm text-slate">
            Visitor header has no ZIP pill. Town personalization can still
            use the internet-connection ZIP in the background.
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
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
      </div>
    </div>
  )
}

function ZipDialogFixture({ postal }: { postal: string }) {
  return (
    <div className="w-[260px] rounded-xl border border-charcoal/10 bg-cream shadow-lg shadow-charcoal/15">
      <div className="border-b border-charcoal/[0.08] px-3.5 py-2.5">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
          Your ZIP · admin fixture
        </p>
        <p className="mt-0.5 text-xs text-charcoal/60 leading-snug">
          IP ZIP is the cable block, not your house. Type 06880, or Use
          precise location if Chrome location is on.
        </p>
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <p className="w-full rounded-lg border border-charcoal/15 bg-white px-3 py-2 font-mono text-sm tracking-[0.2em] text-navy">
          {postal}
        </p>
        <div className="flex items-center gap-2">
          <span className="flex-1 rounded-lg bg-navy px-3 py-2 text-center font-mono text-[10px] tracking-[0.14em] uppercase text-white">
            Save ZIP
          </span>
          <span className="rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/55">
            Cancel
          </span>
        </div>
        <span className="block rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-center font-mono text-[10px] tracking-[0.14em] uppercase text-navy">
          Use precise location
        </span>
        <div className="flex items-center gap-2">
          <span className="flex-1 rounded-lg border border-charcoal/15 px-3 py-2 text-center font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/70">
            Clear ZIP
          </span>
          <span className="flex-1 rounded-lg border border-charcoal/15 px-3 py-2 text-center font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/70">
            Reset
          </span>
        </div>
      </div>
    </div>
  )
}
