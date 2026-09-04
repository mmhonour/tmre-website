"use client";

import { useEffect, useMemo, useState } from "react";
import DealBoardMap, {
  type DealBoardMapListing,
} from "@/components/intelligence/DealBoardMap";
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";
import { useComparablesMapSession } from "@/components/listing/ListingComparablesMapSessionContext";
import type { ComparableListing } from "@/lib/listing-comparables-shared";
import {
  compsMapLayers,
  defaultCompsMapLayer,
  resolveCompsMapFetchUrls,
  type ComparablesKind,
  type CompsMapLayer,
} from "@/lib/listing-comparables-map";
import { listingDetailHref } from "@/lib/listing-url";
import { loadTabJson } from "@/lib/tab-data-prefetch";

type ComparablesResponse = {
  sold?: ComparableListing[];
  active?: ComparableListing[];
};

function toPin(
  comp: ComparableListing,
  pool: "active" | "sold",
  isRental: boolean,
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

function pinsFor(
  comps: readonly ComparableListing[],
  pool: "active" | "sold",
  isRental: boolean,
): DealBoardMapListing[] {
  return comps
    .map((c) => toPin(c, pool, isRental))
    .filter((p): p is DealBoardMapListing => p !== null);
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
 *
 * Default pins match the comps panel's default criteria. When the panel's
 * Matching Criteria ± changes, published session lists replace the fetch so
 * the map stays interactive with the same filter.
 */
export default function ShowcaseCompsMap({
  mlsId,
  subject,
  townHint,
  postalCode,
  expanded = false,
  roomy = false,
  onToggleExpanded,
  onExit,
  fetchUrl,
  rentalFetchUrl,
  hrefFor: hrefForOverride,
  hideSubject = false,
  isRental = false,
}: {
  mlsId: string;
  subject: DealBoardMapListing | null;
  townHint?: string | null;
  /** Drives the blue town outline via the map's zip-boundary layer. */
  postalCode?: string | null;
  expanded?: boolean;
  /**
   * Expanded overlay, details-section map, or a full-screen sheet — enough
   * room to plot the other market's on-market matches alongside the subject's.
   */
  roomy?: boolean;
  onToggleExpanded?: () => void;
  onExit?: () => void;
  /** Spotlight uses `/api/spotlight/comparables`; listing uses the default. */
  fetchUrl?: string | null;
  rentalFetchUrl?: string | null;
  hrefFor?: (listing: DealBoardMapListing) => string;
  /** Privacy: omit the subject pin so the property is not triangulated. */
  hideSubject?: boolean;
  /** Subject is a rental — default layer is For rent / Rented. */
  isRental?: boolean;
}) {
  const subjectKind: ComparablesKind = isRental ? "rental" : "sale";
  const hasRoom = expanded || roomy;
  const layers = useMemo(
    () => compsMapLayers({ subjectKind, roomy: hasRoom }),
    [subjectKind, hasRoom],
  );
  const [saleData, setSaleData] = useState<ComparablesResponse | null>(null);
  const [rentalData, setRentalData] = useState<ComparablesResponse | null>(null);
  const [layer, setLayer] = useState<CompsMapLayer>(() =>
    defaultCompsMapLayer(subjectKind),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const overlay = useLocationEstimateOverlay();
  const session = useComparablesMapSession();
  const urls = useMemo(
    () =>
      resolveCompsMapFetchUrls(mlsId, {
        fetchUrl,
        rentalFetchUrl,
        subjectKind,
      }),
    [mlsId, fetchUrl, rentalFetchUrl, subjectKind],
  );

  const loadSale = subjectKind === "sale" || hasRoom;
  const loadRental = subjectKind === "rental" || hasRoom;

  useEffect(() => {
    setLayer((current) =>
      layers.some((l) => l.id === current)
        ? current
        : defaultCompsMapLayer(subjectKind),
    );
  }, [layers, subjectKind]);

  useEffect(() => {
    if (!loadSale) return;
    let cancelled = false;
    void loadTabJson<ComparablesResponse>(urls.sale)
      .then((d) => {
        if (!cancelled) setSaleData(d ?? {});
      })
      .catch(() => {
        if (!cancelled) setSaleData({});
      });
    return () => {
      cancelled = true;
    };
  }, [urls.sale, loadSale]);

  useEffect(() => {
    if (!loadRental) return;
    let cancelled = false;
    void loadTabJson<ComparablesResponse>(urls.rental)
      .then((d) => {
        if (!cancelled) setRentalData(d ?? {});
      })
      .catch(() => {
        if (!cancelled) setRentalData({});
      });
    return () => {
      cancelled = true;
    };
  }, [urls.rental, loadRental]);

  const saleActive = session?.sale?.active ?? saleData?.active ?? [];
  const saleSold = session?.sale?.sold ?? saleData?.sold ?? [];
  const rentalActive = session?.rental?.active ?? rentalData?.active ?? [];
  const rentalSold = session?.rental?.sold ?? rentalData?.sold ?? [];

  const listings = useMemo(() => {
    let pins: DealBoardMapListing[] = [];
    if (layer === "active-sale") {
      pins = pinsFor(saleActive, "active", false);
    } else if (layer === "active-rental") {
      pins = pinsFor(rentalActive, "active", true);
    } else {
      pins = pinsFor(
        subjectKind === "rental" ? rentalSold : saleSold,
        "sold",
        subjectKind === "rental",
      );
    }
    const pinSubject = hideSubject ? null : subject;
    return pinSubject ? [pinSubject, ...pins] : pins;
  }, [
    layer,
    saleActive,
    saleSold,
    rentalActive,
    rentalSold,
    subject,
    hideSubject,
    subjectKind,
  ]);

  const counts: Record<CompsMapLayer, number> = {
    "active-sale": saleActive.length,
    "active-rental": rentalActive.length,
    closed: (subjectKind === "rental" ? rentalSold : saleSold).length,
  };

  const zips = useMemo(() => {
    const zip = postalCode?.trim().slice(0, 5);
    return zip && /^\d{5}$/.test(zip) ? [zip] : [];
  }, [postalCode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 bg-[#0d1424]/95 px-3 py-2">
        <div className="flex items-center gap-1">
          {layers.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLayer(item.id)}
              aria-pressed={layer === item.id}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
                layer === item.id
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {item.label}
              <span className="ml-1.5 tabular-nums text-white/40">
                {counts[item.id]}
              </span>
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
