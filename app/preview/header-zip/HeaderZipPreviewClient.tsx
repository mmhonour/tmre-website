"use client";

import VisitorLocationBadge from "@/components/VisitorLocationBadge";

function HeaderStrip({ label }: { label: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-charcoal/10">
      <p className="bg-cream px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
        {label}
      </p>
      <div className="flex items-center justify-end gap-2 bg-[#1B2A4A] px-4 py-3">
        <VisitorLocationBadge />
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold text-[11px] text-navy"
          aria-hidden
        >
          @
        </span>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold text-[11px] text-navy"
          aria-hidden
        >
          ☎
        </span>
      </div>
    </div>
  );
}

export default function HeaderZipPreviewClient() {
  return (
    <div className="min-h-screen bg-cream pb-16 pt-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">Header ZIP — no halo</h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          The site-header ZIP has no rotating gold ring on desktop or mobile.
          The pill is still clickable (confirm / change ZIP). Same badge as the
          real header above.
        </p>
        <div className="space-y-6">
          <HeaderStrip label="Desktop strip" />
          <div className="mx-auto w-full max-w-[390px]">
            <HeaderStrip label="Mobile 390px" />
          </div>
        </div>
      </div>
    </div>
  );
}
