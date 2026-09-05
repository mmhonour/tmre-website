"use client";

import { useEffect, useMemo, useState } from "react";
import DealBoardMap, {
  type DealBoardMapListing,
} from "@/components/intelligence/DealBoardMap";
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";
import type { ComparableListing } from "@/lib/listing-comparables-shared";
import { listingDetailHref } from "@/lib/listing-url";
import { loadTabJson } from "@/lib/tab-data-prefetch";

type Pool = "active" | "sold" | "uag";

type ComparablesResponse = {
  sold?: ComparableListing[];
  active?: ComparableListing[];
};

type UagResponse = {
  sale?: ComparableListing[];
  rental?: ComparableListing[];
};

function toPin(
  comp: ComparableListing,
  pool: "active" | "sold",
  isRental = false,
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
    isRental,
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
 * The Intelligence deal-board map pointed at this listing's comparables rather
 * than the board. Fills its parent, so the caller owns the height.
 */
export default function ShowcaseCompsMap({
  mlsId,
  subject,
  townHint,
  postalCode,
  expanded = false,
  onToggleExpanded,
  onExit,
  fetchUrl,
  uagFetchUrl,
  hrefFor: hrefForOverride,
  hideSubject = false,
}: {
  mlsId: string;
  subject: DealBoardMapListing | null;
  townHint?: string | null;
  /** Drives the blue town outline via the map's zip-boundary layer. */
  postalCode?: string | null;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onExit?: () => void;
  /** Spotlight uses `/api/spotlight/comparables`; listing uses the default. */
  fetchUrl?: string | null;
  /** Spotlight uses `/api/spotlight/uag`; listing uses the default. */
  uagFetchUrl?: string | null;
  hrefFor?: (listing: DealBoardMapListing) => string;
  /** Privacy: omit the subject pin so the property is not triangulated. */
  hideSubject?: boolean;
}) {
  const [data, setData] = useState<ComparablesResponse | null>(null);
  const [uagData, setUagData] = useState<UagResponse | null>(null);
  const [pool, setPool] = useState<Pool>("active");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const overlay = useLocationEstimateOverlay();
  const comparablesUrl =
    fetchUrl ?? `/api/listings/${encodeURIComponent(mlsId)}/comparables`;
  const uagUrl =
    uagFetchUrl ?? `/api/listings/${encodeURIComponent(mlsId)}/uag`;

  useEffect(() => {
    let cancelled = false;
    void loadTabJson<ComparablesResponse>(comparablesUrl)
      .then((d) => {
        if (!cancelled) setData(d ?? {});
      })
      .catch(() => {
        if (!cancelled) setData({});
      });
    return () => {
      cancelled = true;
    };
  }, [comparablesUrl]);

  useEffect(() => {
    let cancelled = false;
    void loadTabJson<UagResponse>(uagUrl)
      .then((d) => {
        if (!cancelled) setUagData(d ?? {});
      })
      .catch(() => {
        if (!cancelled) setUagData({});
      });
    return () => {
      cancelled = true;
    };
  }, [uagUrl]);

  const uagPins = useMemo(() => {
    const sale = (uagData?.sale ?? [])
      .map((c) => toPin(c, "active", false))
      .filter((p): p is DealBoardMapListing => p !== null);
    const rental = (uagData?.rental ?? [])
      .map((c) => toPin(c, "active", true))
      .filter((p): p is DealBoardMapListing => p !== null);
    return [...sale, ...rental];
  }, [uagData]);

  const listings = useMemo(() => {
    const pins =
      pool === "uag"
        ? uagPins
        : ((pool === "sold" ? data?.sold : data?.active) ?? [])
            .map((c) => toPin(c, pool))
            .filter((p): p is DealBoardMapListing => p !== null);
    const pinSubject = hideSubject ? null : subject;
    return pinSubject ? [pinSubject, ...pins] : pins;
  }, [data, pool, subject, hideSubject, uagPins]);

  const counts = {
    active: data?.active?.length ?? 0,
    sold: data?.sold?.length ?? 0,
    uag: uagPins.length,
  };

  const zips = useMemo(() => {
    const zip = postalCode?.trim().slice(0, 5);
    return zip && /^\d{5}$/.test(zip) ? [zip] : [];
  }, [postalCode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 bg-[#0d1424]/95 px-3 py-2">
        <div className="flex items-center gap-1">
          {(
            [
              { id: "active" as const, label: "For sale", count: counts.active },
              { id: "uag" as const, label: "UAG", count: counts.uag },
              { id: "sold" as const, label: "Closed", count: counts.sold },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPool(p.id)}
              aria-pressed={pool === p.id}
              title={p.id === "uag" ? "Under agreement" : undefined}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
                pool === p.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {p.label}
              <span className="ml-1.5 tabular-nums text-white/40">{p.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {overlay.unlocked ? (
            <button
              type="button"
              onClick={() => void overlay.setEnabled(!overlay.enabled)}
              disabled={overlay.busy}
              aria-pressed={overlay.enabled}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
                overlay.enabled
                  ? "bg-sky/20 text-sky"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Corridors
            </button>
          ) : null}
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              aria-label="Exit map view"
              className="inline-flex h-9 w-9 items-center justify-center font-mono text-base leading-none text-white/70 transition-colors hover:bg-white/15 hover:text-white lg:h-6 lg:w-6 lg:text-sm"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* DealBoardMap puts `heightClass` on an inner div, so its own outer
            wrapper needs a height too or `h-full` resolves against auto. */}
        {/* `highlightZip` is what paints the boundary blue; `boundZips` alone
            draws it navy and also frames the initial viewport on the town. */}
        <DealBoardMap
          listings={listings}
          subjectKey={hideSubject ? null : subject?.key ?? null}
          boundZips={zips}
          highlightZip={zips[0] ?? null}
          activeKey={activeKey}
          onSelect={setActiveKey}
          hrefFor={
            hrefForOverride ??
            ((l) => listingDetailHref(l.key, l.address, l.city ?? townHint))
          }
          className="h-full"
          heightClass="h-full"
        />
        {/* Over the map, opposite its zoom controls. Sizing is meaningless on a
            phone, where the sheet is already full screen. */}
        {onToggleExpanded ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-pressed={expanded}
            className="absolute right-2 top-2 z-20 hidden rounded-md border border-white/15 bg-navy/85 px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/85 shadow-lg backdrop-blur-sm transition-colors hover:text-gold lg:block"
          >
            {expanded ? "Shrink" : "Full size"}
          </button>
        ) : null}
        <Compass />
      </div>
    </div>
  );
}
