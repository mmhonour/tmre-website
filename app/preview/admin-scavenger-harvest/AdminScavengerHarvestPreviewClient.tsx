"use client";

import { useState } from "react";
import {
  HERO_PHOTO_HARVEST_STRATEGIES,
  resolveHeroPhotoHarvest,
  type HeroPhotoHarvestId,
} from "@/lib/hero-photo-harvest-strategy";

export default function AdminScavengerHarvestPreviewClient() {
  const [harvest, setHarvest] = useState<HeroPhotoHarvestId>("newest");
  const selected = HERO_PHOTO_HARVEST_STRATEGIES.find((row) => row.id === harvest);
  return (
    <div className="min-h-screen bg-cream px-6 pb-16 pt-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate">
        Configure → R2 photo scavenger → Day / Start now includes harvest
        strategy. This select does not save.
      </p>
      <div className="mt-6 max-w-sm rounded-2xl border border-charcoal/10 bg-white p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-charcoal/45">
          Day / Start
        </p>
        <select
          className="mt-2 w-full max-w-[9.5rem] rounded border border-charcoal/15 bg-white px-1.5 py-1 font-mono text-[11px] text-navy"
          value={resolveHeroPhotoHarvest({ harvest })}
          aria-label="Harvest strategy for R2 photo scavenger"
          onChange={(e) => setHarvest(e.target.value as HeroPhotoHarvestId)}
        >
          {HERO_PHOTO_HARVEST_STRATEGIES.map((opt) => (
            <option key={opt.id} value={opt.id} title={opt.hint}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          {selected?.hint}
        </p>
      </div>
    </div>
  );
}
