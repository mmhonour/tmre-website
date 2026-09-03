"use client";

import AdminLocationEstimateGridMap from "@/components/admin/AdminLocationEstimateGridMap";
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";

/**
 * Admin flip + zip-grid painter for coastal strips and the single
 * town-center radius.
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
          One ¼-mile disk per town (Fairfield, not every zip). Coastal value is
          a ¼-mile grid on the town/zip map below — start from All zips or pick
          06890 · Southport, drag to paint, or use Paint south shore and then
          edit. The town-center disk overrides any square it covers. Visitors
          never see the outlines.
        </p>
      </div>
      <div className="space-y-5 px-5 py-4 sm:px-6">
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
        <AdminLocationEstimateGridMap />
      </div>
    </div>
  );
}
