"use client";

import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";

/** On/off for corridor outlines on showcase and Intelligence maps. */
export default function AdminLocationEstimateOverlayPanel() {
  const { enabled, setEnabled, busy } = useLocationEstimateOverlay();

  return (
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
  );
}
