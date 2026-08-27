"use client";

import { useEffect, useMemo, useState } from "react";
import DealBoardMap, {
  type DealBoardMapListing,
} from "@/components/intelligence/DealBoardMap";
import type { ComparableListing } from "@/lib/listing-comparables-shared";
import { listingDetailHref } from "@/lib/listing-url";
import { loadTabJson } from "@/lib/tab-data-prefetch";

type Pool = "active" | "sold";

type ComparablesResponse = {
  sold?: ComparableListing[];
  active?: ComparableListing[];
};

function toPin(
  comp: ComparableListing,
  pool: Pool,
): DealBoardMapListing | null {
  if (comp.latitude == null || comp.longitude == null) return null;
  const price = (pool === "sold" ? comp.closePrice : comp.price) ?? comp.price;
  if (price == null) return null;
  return {
    key: comp.listingKey || comp.mlsId,
    address: comp.address,
    city: comp.city,
    price,
    score: comp.goldilocksScore ?? 0,
    isRental: false,
    beds: comp.beds,
    baths: comp.baths,
    sqft: comp.sqft,
    latitude: comp.latitude,
    longitude: comp.longitude,
    photoCount: comp.photoCount,
  };
}

/** North-up rose — DealBoardMap has a reset-view crosshair but no compass. */
function Compass() {
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-full border border-white/25 bg-navy/75 p-2 backdrop-blur-sm"
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8">
        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" className="text-white/25" />
        <polygon points="16,4 19.5,16 16,13.5 12.5,16" className="fill-coral" />
        <polygon points="16,28 12.5,16 16,18.5 19.5,16" className="fill-white/50" />
        <text
          x="16"
          y="10.5"
          textAnchor="middle"
          className="fill-white font-mono"
          style={{ fontSize: 7 }}
        >
          N
        </text>
      </svg>
    </div>
  );
}

/**
 * The Intelligence deal-board map, pointed at this listing's comparables
 * instead of the board. Gives real pan / wheel-zoom / pinch and multi-pin
 * rendering, which the single-pin `ListingLocationMap` does not have.
 */
export default function ShowcaseCompsMap({
  mlsId,
  subject,
  heightClass,
  townHint,
}: {
  mlsId: string;
  subject: DealBoardMapListing | null;
  heightClass: string;
  townHint?: string | null;
}) {
  const [data, setData] = useState<ComparablesResponse | null>(null);
  const [pool, setPool] = useState<Pool>("active");
  const [expanded, setExpanded] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTabJson<ComparablesResponse>(
      `/api/listings/${encodeURIComponent(mlsId)}/comparables`,
    )
      .then((d) => {
        if (!cancelled) setData(d ?? {});
      })
      .catch(() => {
        if (!cancelled) setData({});
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  const listings = useMemo(() => {
    const comps = (pool === "sold" ? data?.sold : data?.active) ?? [];
    const pins = comps
      .map((c) => toPin(c, pool))
      .filter((p): p is DealBoardMapListing => p !== null);
    return subject ? [subject, ...pins] : pins;
  }, [data, pool, subject]);

  const counts = {
    active: data?.active?.length ?? 0,
    sold: data?.sold?.length ?? 0,
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 bg-[#0d1424]/95 px-3 py-2">
        <div className="flex items-center gap-1">
          {(["active", "sold"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPool(p)}
              aria-pressed={pool === p}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
                pool === p
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {p === "active" ? "For sale" : "Closed"}
              <span className="ml-1.5 tabular-nums text-white/40">
                {p === "active" ? counts.active : counts.sold}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((on) => !on)}
          aria-pressed={expanded}
          className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/60 transition-colors hover:text-white"
        >
          {expanded ? "Shrink" : "Full size"}
        </button>
      </div>

      <div className="relative">
        <DealBoardMap
          listings={listings}
          activeKey={activeKey}
          onSelect={setActiveKey}
          hrefFor={(l) => listingDetailHref(l.key, l.address, l.city ?? townHint)}
          heightClass={expanded ? "h-[50dvh]" : heightClass}
        />
        <Compass />
      </div>
    </div>
  );
}
