"use client";

import { useState } from "react";
import AdminHeroInventoryLines from "@/components/admin/AdminHeroInventoryLines";

const FIXTURE_LISTINGS = 29596;
const FIXTURE_PHOTOS = 695690;

type Mode = "populated" | "empty" | "refreshing";

export default function AdminHeroPhotoCountPreviewClient() {
  const [mode, setMode] = useState<Mode>("populated");
  return (
    <div className="min-h-screen bg-cream">
      <p className="px-6 pt-24 font-mono text-[11px] uppercase tracking-[0.18em] text-slate">
        Admin hero now lists Postgres listings and listing_photo_index rows that
        point at R2. Fixture counts — not live Neon.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 px-6">
        {(["populated", "empty", "refreshing"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
              mode === id
                ? "border-gold bg-gold/15 text-navy"
                : "border-charcoal/15 text-slate"
            }`}
          >
            {id}
          </button>
        ))}
      </div>
      <section className="navy-gradient relative mt-6 overflow-hidden text-white pb-8 pt-10">
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <h1 className="font-serif text-4xl leading-[1.05] text-white">
            Admin <span className="italic gold-shimmer">status.</span>
          </h1>
          <div className="mt-4 font-mono text-xs">
            <AdminHeroInventoryLines
              listings={mode === "empty" ? 0 : FIXTURE_LISTINGS}
              photos={mode === "empty" ? 0 : FIXTURE_PHOTOS}
              refreshing={mode === "refreshing"}
              listingsEmpty={mode === "empty"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
