"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";
import { COASTAL_STRIP_LEGEND } from "@/lib/location-estimate-zip-grid-shared";
import {
  formatLocationPremiumBoost,
  LOCATION_PREMIUM_WATER_TIERS,
} from "@/lib/listing-location-premium";

/** On/off for corridor outlines, plus what Coast 1–4 means for What if. */
export default function AdminLocationEstimateOverlayPanel() {
  const { enabled, setEnabled, busy } = useLocationEstimateOverlay();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label className="inline-flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void setEnabled(e.target.checked)}
          className="rounded border-charcoal/30"
        />
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
          Show corridors and town centers
        </span>
        <span
          className={`font-mono text-[9px] tracking-[0.12em] uppercase ${
            enabled ? "text-sage" : "text-charcoal/40"
          }`}
        >
          {enabled ? "on" : "off"}
        </span>
      </label>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
        >
          What 1–4 do on What if
        </button>
        {open ? (
          <div
            id={panelId}
            role="dialog"
            aria-label="Coastal strips and What if"
            className="absolute left-0 top-full z-30 mt-1.5 w-[min(22rem,calc(100vw-2.5rem))] rounded-md border border-charcoal/15 bg-white px-3 py-2.5 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
              What if on listing / showcase
            </p>
            <p className="mt-1 text-[12px] leading-snug text-slate">
              Painting a square does not change What if today. Those numbers
              use distance to hardcoded water-access points, then weight comps
              by how close that multiplier is to the subject.
            </p>
            <ul className="mt-2 space-y-1">
              {LOCATION_PREMIUM_WATER_TIERS.map((tier) => (
                <li
                  key={tier.label}
                  className="flex justify-between gap-3 font-mono text-[11px] text-navy"
                >
                  <span>≤ {tier.maxMiles} mi · {tier.label}</span>
                  <span className="shrink-0 tabular-nums text-charcoal/60">
                    {formatLocationPremiumBoost(tier.boost)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[10px] leading-snug text-charcoal/45">
              Village-center and golf stack on top; combined cap is +22%.
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
              Painted 1–4 (this map)
            </p>
            <ul className="mt-1 space-y-1">
              {([0, 1, 2, 3] as const).map((strip) => {
                const row = COASTAL_STRIP_LEGEND[strip];
                return (
                  <li key={row.mark} className="text-[12px] leading-snug text-slate">
                    <span className="font-mono text-[11px] text-navy">
                      {row.mark} {row.name}
                    </span>
                    <span className="text-charcoal/55"> — {row.blurb}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
