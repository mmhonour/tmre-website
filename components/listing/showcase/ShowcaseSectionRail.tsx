"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import ListingSidebar from "@/components/listing/ListingSidebar";
import {
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SALE_ON_MARKET_PANEL_ID,
} from "@/components/listing/listing-section-ids";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import ShowcaseTownPulse from "@/components/listing/showcase/ShowcaseTownPulse";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
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
      className="inline-flex shrink-0 items-center gap-1.5 bg-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65 transition-colors hover:bg-white/20 hover:text-white"
    >
      {label}
      <span className="tabular-nums text-white">{count}</span>
    </button>
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

/** Truer red than `--color-coral` (#C85A3A), which reads burnt orange. */
const PULSE_RED = "#E02420";

/**
 * Two heat-map teardrops on the 10 / 4 axis: red (seller) and sage
 * (buyer), gold down each tail. Each eye is gold fading into the bulb
 * around it. Pencil-thin white rim; a gold hairline traces the S.
 */
function PulseGlyph() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const seller = `${uid}-seller`;
  const buyer = `${uid}-buyer`;
  const eyeSage = `${uid}-eye-sage`;
  const eyeRed = `${uid}-eye-red`;
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={seller} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0" stopColor={PULSE_RED} />
          <stop offset="0.52" stopColor={PULSE_RED} />
          <stop offset="1" stopColor="var(--color-gold)" />
        </linearGradient>
        <linearGradient id={buyer} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="var(--color-sage)" />
          <stop offset="0.52" stopColor="var(--color-sage)" />
          <stop offset="1" stopColor="var(--color-gold)" />
        </linearGradient>
        <radialGradient id={eyeSage}>
          <stop offset="0" stopColor="var(--color-gold)" />
          <stop offset="0.34" stopColor="var(--color-gold)" />
          <stop offset="1" stopColor="var(--color-sage)" />
        </radialGradient>
        <radialGradient id={eyeRed}>
          <stop offset="0" stopColor="var(--color-gold)" />
          <stop offset="0.34" stopColor="var(--color-gold)" />
          <stop offset="1" stopColor={PULSE_RED} />
        </radialGradient>
      </defs>
      <g transform="rotate(-60 12 12)">
        <circle cx="12" cy="12" r="10" fill={`url(#${buyer})`} />
        <path
          d="M12 2 A10 10 0 0 0 12 22 A5 5 0 0 0 12 12 A5 5 0 0 1 12 2 Z"
          fill={`url(#${seller})`}
        />
        <path
          d="M12 2 A5 5 0 0 1 12 12 A5 5 0 0 0 12 22"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="0.55"
          strokeLinecap="round"
        />
        <circle cx="12" cy="7" r="2.6" fill={`url(#${eyeSage})`} />
        <circle cx="12" cy="17" r="2.6" fill={`url(#${eyeRed})`} />
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="white"
          strokeWidth="0.4"
        />
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

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
   * Map, pulse and details share one overlay so their three icons stay a
   * single exclusive toggle — opening one closes the others, and the icon
   * row travels with whichever panel is up.
   */
  const [overlay, setOverlayState] = useState<"map" | "pulse" | "details" | null>(
    null,
  );
  const [mapExpanded, setMapExpanded] = useState(false);

  const setOverlay = (next: "map" | "pulse" | "details" | null) => {
    setOverlayState(next);
    onMapStateChange?.({
      open: next === "map",
      expanded: next === "map" && mapExpanded,
    });
    onDetailsOnlyChange?.(next === "pulse" || next === "details");
  };
  const toggleOverlay = (id: "map" | "pulse" | "details") =>
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

  /* The three overlays share this row so they stay a group. */
  const iconRow = (
    <div className="mt-1 flex items-center gap-1">
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
        className={`${railIconClass(overlay === "pulse")} p-0`}
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
        <div className={`${railRowClass({ interactive: false })} gap-2`}>
          <button
            type="button"
            onClick={() => scrollToShowcaseSection("comps")}
            className="shrink-0 transition-colors hover:text-gold"
          >
            Comps
          </button>
          <span className="flex flex-1 items-center justify-end gap-1">
            <CountChip
              label="On market"
              count={counts.active}
              onClick={() => scrollToId(LISTING_SALE_ON_MARKET_PANEL_ID)}
            />
            <CountChip
              label={`Sold ${counts.soldMonths} in mos`}
              count={counts.sold}
              onClick={() => scrollToId(LISTING_RECENTLY_SOLD_PANEL_ID)}
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
        className={`absolute right-0 top-[calc(50%-9.5rem)] z-20 flex max-h-[calc(100dvh-9rem)] flex-col items-end overflow-y-auto ${RAIL_WIDTH}`}
      >
        {overlay === "pulse" || overlay === "details" ? (
          <>
            {/* Icons first in this mode: the card can run to 70vh, which would
                push the only way out below the fold. */}
            {iconRow}
            <div className="mt-1 max-h-[70vh] w-full overflow-y-auto overscroll-contain bg-[#0d1424]/85 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md">
              {overlay === "details" ? (
                /* The dashboard's own Details card, not a second summary —
                   same component the deck below the photo renders. */
                <ListingSidebar details={detailsPanelProps} />
              ) : (
                <div className="p-4">
                  <ShowcaseTownPulse city={townHint ?? ""} expanded />
                </div>
              )}
            </div>
          </>
        ) : overlay === "map" ? null : (
          <>
        {cardPill(
          "pulse",
          "Town pulse",
          <ShowcaseTownPulse city={townHint ?? ""} expanded={openCard === "pulse"} />,
        )}

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
