"use client";

import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";

/**
 * Admin flip for dotted coastal-strip + town-center outlines on the
 * showcase and Intelligence maps.
 */
export default function AdminLocationEstimateOverlayPanel() {
  const { enabled, setEnabled, busy } = useLocationEstimateOverlay();

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Location estimates · map outlines
        </p>
        <p className="mt-1 max-w-3xl text-sm text-charcoal/65">
          When this is on, the showcase map and the Intelligence deal-board map
          draw the estimator&apos;s geometry: town-center disks (¼-mile radius)
          and coastal land strips (stacked ¼-mile bands along the shore, out to
          about a mile). Only while the site is unlocked — visitors never see
          it. Same control lives as a chip on those maps.
        </p>
      </div>
      <div className="px-5 py-4 sm:px-6">
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
      </div>
    </div>
  );
}
