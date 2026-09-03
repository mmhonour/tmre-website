"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import {
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SALE_ON_MARKET_PANEL_ID,
} from "@/components/listing/listing-section-ids";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import ShowcaseInsightBody from "@/components/listing/showcase/ShowcaseInsightBody";
import ShowcaseTownPulse from "@/components/listing/showcase/ShowcaseTownPulse";
import {
  jumpToListingSection,
  scrollToShowcaseSection,
} from "@/components/listing/showcase/showcase-sections";
import type { ShowcaseDetailRow } from "@/components/listing/showcase/showcase-types";
import {
  fmtIfRentMoney,
  fmtIfSaleMoney,
  roundIfRentMidpoint,
} from "@/lib/listing-if-estimates";
import { loadTabJson } from "@/lib/tab-data-prefetch";

type CardId = "pulse" | "insight" | "details";

const RAIL_WIDTH = "w-[min(24rem,calc(100vw-3rem))]";

/** Shared tile geometry; `interactive` adds the hover the whole-row tiles use. */
const railRowClass = (opts: {
  open?: boolean;
  fullWidth?: boolean;
  interactive?: boolean;
}) =>
  `flex items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    // `w-fit` rather than `w-auto`: a block-level flex box with auto width
    // still stretches to its container.
    opts.fullWidth ? "w-full" : "w-fit lg:w-full"
  } ${
    opts.open
      ? "bg-navy text-white"
      : `bg-[#0d1424]/85 text-white/85 ${
          opts.interactive === false ? "" : "hover:bg-navy hover:text-white"
        }`
  }`;

const pillClass = (open: boolean, fullWidth = false) =>
  railRowClass({ open, fullWidth });

/** Summary + jump control, matching the map's For sale / Closed toggles. */
function CountChip({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} comparables`}
      className="pointer-events-auto relative z-10 inline-flex shrink-0 items-center gap-1.5 bg-white/[0.08] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65 transition-colors hover:bg-white/20 hover:text-white"
    >
      {label}
      <span className="tabular-nums text-white">{count}</span>
    </button>
  );
}

function InsightGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18h6M10 21h4" />
      <path d="M8 14.2C6.2 12.8 5 10.7 5 8.4A7 7 0 0 1 12 1.5 7 7 0 0 1 19 8.4c0 2.3-1.2 4.4-3 5.8" />
      <path d="M9 14h6v2.2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V14z" />
    </svg>
  );
}

function MapGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

/**
 * Same 20×20 slot as Map / Insight / Details so the button chrome matches.
 * Gradients are unique per mount so two icon rows do not collide.
 */
function PulseGlyph() {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden
    >
      <defs>
        <radialGradient id={`${uid}-yin`} cx="12" cy="7.8" r="8.4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4A7C6F" />
          <stop offset="1" stopColor="#C8A951" />
        </radialGradient>
        <radialGradient id={`${uid}-eyeGreen`}>
          <stop offset="0" stopColor="#FF2A22" />
          <stop offset="1" stopColor="#4A7C6F" />
        </radialGradient>
        <radialGradient id={`${uid}-eyeRed`}>
          <stop offset="0" stopColor="#C8A951" />
          <stop offset="0.48" stopColor="#FF2A22" />
          <stop offset="1" stopColor="#FF2A22" />
        </radialGradient>
      </defs>
      <g transform="rotate(-60 12 12)">
        <circle cx="12" cy="12" r="8.4" fill={`url(#${uid}-yin)`} />
        <path
          d="M12 3.6 A8.4 8.4 0 0 0 12 20.4 A4.2 4.2 0 0 0 12 12 A4.2 4.2 0 0 1 12 3.6 Z"
          fill="#FF2A22"
        />
        <circle cx="12" cy="7.8" r="2.17" fill={`url(#${uid}-eyeGreen)`} />
        <circle cx="12" cy="16.2" r="2.7" fill={`url(#${uid}-eyeRed)`} />
      </g>
    </svg>
  );
}

function DetailsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h10M4 12h16M4 17h12" />
      <circle cx="19" cy="7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="17" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Icon-only rail control — same translucent navy as the tiles. */
const railIconClass = (on: boolean) =>
  `inline-flex h-11 w-11 items-center justify-center shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors ${
    on
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

type CompsCounts = { active: number; sold: number; soldMonths: number };
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
  insightFacts,
  detailRows,
  subject,
  townHint,
  postalCode,
  detailsPanelProps,
  onNext,
  onMapStateChange,
  onDetailsOnlyChange,
}: {
  mlsId: string;
  insight: string | null;
  /** Showcase-only facts line, rendered under the shared insight. */
  insightFacts?: string | null;
  detailRows: ShowcaseDetailRow[];
  subject: DealBoardMapListing | null;
  townHint?: string | null;
  postalCode?: string | null;
  detailsPanelProps: ListingDetailsSchoolsPanelProps;
  onNext: () => void;
  /** Lets the hero drop its edge arrow while the rail carries the pair. */
  onDetailsOnlyChange?: (on: boolean) => void;
  /** Lets the hero shift its price clear of the map column. */
  onMapStateChange?: (state: { open: boolean; expanded: boolean }) => void;
}) {
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  /**
   * Insight, map, pulse and details share one overlay so their icons stay a
   * single exclusive toggle — opening one closes the others, and the icon
   * row travels with whichever panel is up.
   */
  const [overlay, setOverlayState] = useState<
    "insight" | "map" | "pulse" | "details" | null
  >(null);
  const [mapExpanded, setMapExpanded] = useState(false);

  const setOverlay = (
    next: "insight" | "map" | "pulse" | "details" | null,
  ) => {
    setOverlayState(next);
    onMapStateChange?.({
      open: next === "map",
      expanded: next === "map" && mapExpanded,
    });
    onDetailsOnlyChange?.(
      next === "insight" || next === "pulse" || next === "details",
    );
  };
  const toggleOverlay = (id: "insight" | "map" | "pulse" | "details") =>
    setOverlay(overlay === id ? null : id);
  const setExpanded = (expanded: boolean) => {
    setMapExpanded(expanded);
    onMapStateChange?.({ open: overlay === "map", expanded });
  };
  const [revealed, setRevealed] = useState<string | null>(null);
  const [counts, setCounts] = useState<CompsCounts | null>(null);
  const [amounts, setAmounts] = useState<IfAmounts | null>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    let cancelled = false;
    // Both are already in the tab-data cache in most cases, so this is usually
    // a memory read rather than a second request.
    void loadTabJson<{
      active?: unknown[];
      soldWithinLookbackCount?: number;
      soldLookbackMonths?: number;
    }>(`/api/listings/${encodeURIComponent(mlsId)}/comparables`).then((d) => {
      if (cancelled || !d) return;
      setCounts({
        active: d.active?.length ?? 0,
        sold: d.soldWithinLookbackCount ?? 0,
        soldMonths: d.soldLookbackMonths ?? 12,
      });
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
            <span className="ml-3 flex flex-1 items-center justify-end gap-3 whitespace-nowrap normal-case tracking-[0.08em] text-white">
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

  /* The four overlays share this row so they stay a group. */
  const iconRow = (
    <div className="mt-1 flex items-center gap-1">
      <button
        type="button"
        onClick={() => toggleOverlay("insight")}
        aria-pressed={overlay === "insight"}
        aria-label={overlay === "insight" ? "Close insight" : "Show insight"}
        title="Insight"
        className={railIconClass(overlay === "insight")}
      >
        <InsightGlyph />
      </button>
      <button
        type="button"
        onClick={() => toggleOverlay("map")}
        aria-pressed={overlay === "map"}
        aria-label={overlay === "map" ? "Close map" : "Open map"}
        title="Map"
        className={railIconClass(overlay === "map")}
      >
        <MapGlyph />
      </button>
      <button
        type="button"
        onClick={() => toggleOverlay("pulse")}
        aria-pressed={overlay === "pulse"}
        aria-label={overlay === "pulse" ? "Close town pulse" : "Show town pulse"}
        title="Town pulse"
        className={railIconClass(overlay === "pulse")}
      >
        <PulseGlyph />
      </button>
      <button
        type="button"
        onClick={() => toggleOverlay("details")}
        aria-pressed={overlay === "details"}
        aria-label={overlay === "details" ? "Close details" : "Show details"}
        title={overlay === "details" ? "Close details" : "Details"}
        className={railIconClass(overlay === "details")}
      >
        <DetailsGlyph />
      </button>
    </div>
  );

  const mapOverlay = overlay === "map" ? (
    /*
     * Phone: true full screen, over the site header, like the Intelligence
     * map. The header bar below carries the only exit, so it has to stay
     * pinned at the top of the sheet.
     *
     * Desktop: a column beside the photo, offset to clear the fixed header
     * (~85px); the usual pt-24 leaves its zip / mail / phone cluster (z-50)
     * painting over the map.
     */
    <div
      className={`flex flex-col max-lg:fixed max-lg:inset-0 max-lg:z-[60] lg:absolute lg:bottom-0 lg:right-0 lg:top-28 lg:z-40 ${
        mapExpanded ? "lg:w-[min(50vw,44rem)]" : "lg:w-96"
      }`}
    >
      <div className="flex shrink-0 justify-end">{iconRow}</div>
      <div className="min-h-0 flex-1">
        <ShowcaseCompsMap
          mlsId={mlsId}
          subject={subject}
          townHint={townHint}
          postalCode={postalCode}
          expanded={mapExpanded}
          onToggleExpanded={() => setExpanded(!mapExpanded)}
          onExit={() => setOverlay(null)}
        />
      </div>
    </div>
  ) : null;

  /**
   * Its own tile rather than a `figurePill`: the two chips are real buttons,
   * which cannot be nested inside the tile's own button element.
   */
  const compsPill = (() => {
    const showChips = (isDesktop || revealed === "comps") && counts;
    if (!showChips) {
      return (
        <div className="flex w-full flex-col items-end lg:items-stretch">
          <button
            type="button"
            onClick={() => setRevealed("comps")}
            className={pillClass(false)}
          >
            <span className="shrink-0">Comps</span>
            <span
              aria-hidden
              className="showcase-chevron-pulse ml-3 font-mono text-white/70"
            >
              »
            </span>
          </button>
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col items-end lg:items-stretch">
        <div
          className={`${railRowClass({ interactive: false })} pointer-events-auto relative z-10 gap-2`}
        >
          <button
            type="button"
            onClick={() => scrollToShowcaseSection("comps")}
            className="pointer-events-auto shrink-0 transition-colors hover:text-gold"
          >
            Comps
          </button>
          <span className="flex flex-1 items-center justify-end gap-1">
            <CountChip
              label="On market"
              count={counts.active}
              onClick={() =>
                jumpToListingSection(LISTING_SALE_ON_MARKET_PANEL_ID)
              }
            />
            <CountChip
              label={`Sold ${counts.soldMonths} in mos`}
              count={counts.sold}
              onClick={() =>
                jumpToListingSection(LISTING_RECENTLY_SOLD_PANEL_ID)
              }
            />
          </span>
        </div>
      </div>
    );
  })();

  return (
    <>
      {mapOverlay}
      {/*
       * Top-anchored rather than centred so an open card only ever grows
       * downward; the offset puts the step arrow on the vertical middle when
       * nothing is open.
       */}
      <div
        className={`pointer-events-auto absolute right-0 top-[calc(50%-9.5rem)] z-20 flex max-h-[calc(100dvh-9rem)] flex-col items-end overflow-y-auto ${RAIL_WIDTH}`}
      >
        {overlay === "insight" || overlay === "pulse" || overlay === "details" ? (
          <>
            {/* Icons first in this mode: the card can run to 70vh, which would
                push the only way out below the fold. */}
            {iconRow}
            <button
              type="button"
              onClick={() => toggleOverlay(overlay)}
              aria-expanded
              className={`${pillClass(true, true)} mt-1`}
            >
              <span className="flex-1">
                {overlay === "insight"
                  ? "Insight"
                  : overlay === "pulse"
                    ? "Town pulse"
                    : "Details"}
              </span>
              <Chevron open />
            </button>
            <div className="max-h-[70vh] w-full overflow-y-auto overscroll-contain bg-[#0d1424]/85 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md">
              {overlay === "details" ? (
                /* The dashboard's own Details card, not a second summary —
                   same component the deck below the photo renders. */
                <ListingSidebar details={detailsPanelProps} />
              ) : overlay === "pulse" ? (
                <div className="p-4">
                  <ShowcaseTownPulse city={townHint ?? ""} expanded />
                </div>
              ) : (
                <div className="p-4">
                  <ShowcaseInsightBody insight={insight} facts={insightFacts ?? null} />
                </div>
              )}
            </div>
          </>
        ) : overlay === "map" ? null : (
          <>
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

        {compsPill}

        <ShowcaseStepArrow direction="next" label="Next photo" onClick={onNext} />

        {figurePill(
          "if",
          "What if",
          ifLabel ? <span>{ifLabel}</span> : null,
          () => scrollToShowcaseSection("if"),
        )}

          </>
        )}

        {overlay ? null : iconRow}
      </div>
    </>
  );
}
