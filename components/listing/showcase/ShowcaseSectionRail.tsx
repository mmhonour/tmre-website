"use client";

import { useEffect, useMemo, useState } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import {
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SALE_ON_MARKET_PANEL_ID,
} from "@/components/listing/listing-section-ids";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
import type { ShowcaseDetailRow } from "@/components/listing/showcase/showcase-types";
import {
  fmtIfRentMoney,
  fmtIfSaleMoney,
  roundIfRentMidpoint,
} from "@/lib/listing-if-estimates";
import { loadTabJson } from "@/lib/tab-data-prefetch";

type CardId = "insight" | "details";

const RAIL_WIDTH = "w-[min(24rem,calc(100vw-3rem))]";

const pillClass = (open: boolean, fullWidth = false) =>
  `flex items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    // `w-fit` rather than `w-auto`: a block-level flex box with auto width
    // still stretches to its container.
    fullWidth ? "w-full" : "w-fit lg:w-full"
  } ${
    open
      ? "bg-navy text-white"
      : "bg-[#0d1424]/85 text-white/85 hover:bg-navy hover:text-white"
  }`;

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="ml-3 font-mono text-white/60">
      {open ? "↑" : "↓"}
    </span>
  );
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type CompsCounts = { active: number; sold: number };
type IfAmounts = { sale: number | null; rent: number | null };

/**
 * Rail of flush rectangular tiles over the right of the photo. Insight and
 * Details expand in flow; Comps and What if carry their own figures and jump to
 * the matching section; Map takes over the right column.
 *
 * Below `lg` the figures are hidden behind a pulsing chevron — first tap
 * reveals them, second tap navigates — so the rail stays narrow on a phone.
 */
export default function ShowcaseSectionRail({
  mlsId,
  insight,
  detailRows,
  subject,
  townHint,
  postalCode,
  onNext,
}: {
  mlsId: string;
  insight: string | null;
  detailRows: ShowcaseDetailRow[];
  subject: DealBoardMapListing | null;
  townHint?: string | null;
  postalCode?: string | null;
  onNext: () => void;
}) {
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [counts, setCounts] = useState<CompsCounts | null>(null);
  const [amounts, setAmounts] = useState<IfAmounts | null>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    let cancelled = false;
    // Both are already in the tab-data cache in most cases, so this is usually
    // a memory read rather than a second request.
    void loadTabJson<{ sold?: unknown[]; active?: unknown[] }>(
      `/api/listings/${encodeURIComponent(mlsId)}/comparables`,
    ).then((d) => {
      if (cancelled || !d) return;
      setCounts({ active: d.active?.length ?? 0, sold: d.sold?.length ?? 0 });
    });
    void loadTabJson<{
      sale?: { amount?: number | null };
      rent?: { amount?: number | null };
    }>(`/api/listings/${encodeURIComponent(mlsId)}/if`).then((d) => {
      if (cancelled || !d) return;
      setAmounts({ sale: d.sale?.amount ?? null, rent: d.rent?.amount ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  const ifLabel = useMemo(() => {
    if (!amounts) return null;
    const sale = amounts.sale != null ? fmtIfSaleMoney(amounts.sale) : null;
    const rent =
      amounts.rent != null
        ? fmtIfRentMoney(roundIfRentMidpoint(amounts.rent))
        : null;
    if (!sale && !rent) return null;
    return `${sale ?? "—"} / ${rent ?? "—"}`;
  }, [amounts]);

  const toggle = (id: CardId) => setOpenCard((cur) => (cur === id ? null : id));

  const cardPill = (id: CardId, label: string, body: React.ReactNode) => {
    const open = openCard === id;
    return (
      <div className="flex w-full flex-col items-end lg:items-stretch">
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={open}
          className={pillClass(open)}
        >
          <span className="flex-1">{label}</span>
          <Chevron open={open} />
        </button>
        {open ? (
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain bg-[#0d1424]/95 p-4 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md">
            {body}
          </div>
        ) : null}
      </div>
    );
  };

  /**
   * Tiles that carry figures. Desktop shows them inline; mobile hides them
   * behind one tap so the rail does not wall off the photo.
   */
  const figurePill = (
    id: string,
    label: string,
    figures: React.ReactNode | null,
    onActivate: () => void,
  ) => {
    const showFigures = isDesktop || revealed === id;
    return (
      <div className="flex w-full flex-col items-end lg:items-stretch">
        <button
          type="button"
          onClick={() => {
            if (showFigures) {
              onActivate();
              return;
            }
            setRevealed(id);
          }}
          className={pillClass(false)}
        >
          <span className="shrink-0">{label}</span>
          {showFigures && figures ? (
            <span className="ml-3 flex flex-1 items-center justify-end gap-3 normal-case tracking-[0.08em] text-white">
              {figures}
            </span>
          ) : null}
          {!showFigures ? (
            <span
              aria-hidden
              className="showcase-chevron-pulse ml-3 font-mono text-white/70"
            >
              »
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  const mapOverlay = mapOpen ? (
    /*
     * Phone: pinned edge to edge under the site header. A right-hand column on
     * a 390px screen is a tall thin slice of geography beside a useless strip
     * of photo. Deliberately below the header rather than over it — the map
     * owns pan and pinch, so leaving the nav reachable is the only way off the
     * page besides the close button.
     *
     * Desktop: a column beside the photo. Both offsets clear the fixed header
     * (~77px mobile, ~85px desktop); the usual pt-20/pt-24 leaves its zip /
     * mail / phone cluster (z-50) painting over the map.
     */
    <div
      className={`flex flex-col max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-24 max-lg:z-40 lg:absolute lg:bottom-0 lg:right-0 lg:top-28 lg:z-40 ${
        mapExpanded ? "lg:w-[min(50vw,44rem)]" : "lg:w-96"
      }`}
    >
      <button
        type="button"
        onClick={() => setMapOpen(false)}
        aria-expanded
        className={`${pillClass(true, true)} shrink-0`}
      >
        <span className="flex-1">Map</span>
        <Chevron open />
      </button>
      <div className="min-h-0 flex-1">
        <ShowcaseCompsMap
          mlsId={mlsId}
          subject={subject}
          townHint={townHint}
          postalCode={postalCode}
          expanded={mapExpanded}
          onToggleExpanded={() => setMapExpanded((on) => !on)}
          onExit={() => setMapOpen(false)}
        />
      </div>
    </div>
  ) : null;

  const compsFigures = counts ? (
    <>
      <span
        role={isDesktop ? "button" : undefined}
        tabIndex={isDesktop ? 0 : -1}
        onClick={(e) => {
          if (!isDesktop) return;
          e.stopPropagation();
          scrollToId(LISTING_SALE_ON_MARKET_PANEL_ID);
        }}
        className={isDesktop ? "cursor-pointer hover:text-gold" : undefined}
      >
        {counts.active} Market
      </span>
      <span
        role={isDesktop ? "button" : undefined}
        tabIndex={isDesktop ? 0 : -1}
        onClick={(e) => {
          if (!isDesktop) return;
          e.stopPropagation();
          scrollToId(LISTING_RECENTLY_SOLD_PANEL_ID);
        }}
        className={isDesktop ? "cursor-pointer hover:text-gold" : undefined}
      >
        {counts.sold} Sold
      </span>
    </>
  ) : null;

  return (
    <>
      {mapOverlay}
      {/*
       * Top-anchored rather than centred so an open card only ever grows
       * downward; the offset puts the step arrow on the vertical middle when
       * nothing is open.
       */}
      <div
        className={`absolute right-0 top-[calc(50%-9.5rem)] z-20 flex max-h-[calc(100dvh-9rem)] flex-col items-end overflow-y-auto ${RAIL_WIDTH}`}
      >
        {cardPill(
          "insight",
          "Insight",
          insight ? (
            <ListingInsightCopy
              text={insight}
              className="text-sm leading-relaxed text-white/80"
            />
          ) : (
            <p className="text-sm text-white/50">No insight for this listing.</p>
          ),
        )}

        {cardPill(
          "details",
          "Details",
          <dl className="divide-y divide-white/10">
            {detailRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                  {row.label}
                </dt>
                <dd className="text-right text-sm text-white/90">{row.value}</dd>
              </div>
            ))}
          </dl>,
        )}

        {figurePill("comps", "Comps", compsFigures, () =>
          scrollToShowcaseSection("comps"),
        )}

        <ShowcaseStepArrow direction="next" label="Next photo" onClick={onNext} />

        {figurePill(
          "if",
          "What if",
          ifLabel ? <span>{ifLabel}</span> : null,
          () => scrollToShowcaseSection("if"),
        )}

        <button
          type="button"
          onClick={() => setMapOpen(true)}
          aria-expanded={false}
          className={pillClass(false)}
        >
          <span className="flex-1">Map</span>
          <Chevron open={false} />
        </button>
      </div>
    </>
  );
}
