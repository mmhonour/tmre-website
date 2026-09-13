"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import {
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SALE_ON_MARKET_PANEL_ID,
} from "@/components/listing/listing-section-ids";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import ShowcaseInsightBody from "@/components/listing/showcase/ShowcaseInsightBody";
import ShowcaseTownPulse from "@/components/listing/showcase/ShowcaseTownPulse";
import {
  CompsGlyph,
  DetailsGlyph,
  InsightGlyph,
  MapGlyph,
  PulseGlyph,
  WhatIfGlyph,
} from "@/components/listing/showcase/showcase-rail-glyphs";
import type { ShowcaseMapPresentation } from "@/components/listing/showcase/showcase-host";
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

type DetailsTab = "summary" | "full";

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

function DetailsOverlayTabs({
  tab,
  onChange,
}: {
  tab: DetailsTab;
  onChange: (tab: DetailsTab) => void;
}) {
  return (
    <div className="flex gap-0 border-b border-white/10 px-3">
      {(["summary", "full"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ${
            tab === id
              ? "border-b-2 border-gold text-white"
              : "border-b-2 border-transparent text-white/45 hover:text-white/80"
          }`}
        >
          {id === "summary" ? "Summary" : "Full"}
        </button>
      ))}
    </div>
  );
}

function MinimizeGlyphButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-2 shrink-0 px-1 font-mono text-white/70 transition-colors hover:text-white"
    >
      «
    </button>
  );
}

type CompsCounts = { active: number; sold: number; soldMonths: number };
type IfAmounts = { sale: number | null; rent: number | null };

/**
 * Rail of flush rectangular tiles over the right of the photo. Every pill
 * starts as a symbol. Insight sits above Details; one Details icon opens a
 * Summary / Full tab pair. Comps and What if reveal figures on tap, then «
 * hides them. Map takes over the right column.
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
  compsFetchUrl,
  uagFetchUrl,
  map,
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
  compsFetchUrl?: string | null;
  uagFetchUrl?: string | null;
  /** Spotlight privacy: town-outline map instead of comps + pin. */
  map?: ShowcaseMapPresentation | null;
}) {
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
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("summary");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [counts, setCounts] = useState<CompsCounts | null>(null);
  const [amounts, setAmounts] = useState<IfAmounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Both are already in the tab-data cache in most cases, so this is usually
    // a memory read rather than a second request.
    void loadTabJson<{
      active?: unknown[];
      soldWithinLookbackCount?: number;
      soldLookbackMonths?: number;
    }>(
      compsFetchUrl ??
        `/api/listings/${encodeURIComponent(mlsId)}/comparables`,
    ).then((d) => {
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
  }, [mlsId, compsFetchUrl]);

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

  /**
   * Tiles that carry figures. Both breakpoints start as a symbol; first tap
   * reveals the label and figures, « hides them again.
   */
  const figurePill = (
    id: string,
    label: string,
    glyph: ReactNode,
    figures: ReactNode | null,
    onActivate: () => void,
  ) => {
    const showFigures = revealed === id;
    if (showFigures) {
      return (
        <div className="flex w-full flex-col items-end lg:items-stretch">
          <div className={`${railRowClass({ interactive: false })} gap-2`}>
            <button
              type="button"
              onClick={onActivate}
              className="flex min-w-0 flex-1 items-center text-left transition-colors hover:text-gold"
            >
              <span className="mr-2.5 inline-flex">{glyph}</span>
              <span className="shrink-0">{label}</span>
              {figures ? (
                <span className="ml-3 flex flex-1 items-center justify-end gap-3 whitespace-nowrap normal-case tracking-[0.08em] text-white">
                  {figures}
                </span>
              ) : null}
            </button>
            <MinimizeGlyphButton
              label={`Hide ${label}`}
              onClick={() => setRevealed(null)}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col items-end">
        <button
          type="button"
          onClick={() => setRevealed(id)}
          aria-label={label}
          title={label}
          className={railIconClass(false)}
        >
          {glyph}
        </button>
      </div>
    );
  };

  /* Insight sits above Details; Map and Pulse stay beside that stack. */
  const iconRow = (
    <div className="mt-1 flex items-end gap-1">
      <div className="flex flex-col gap-1">
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
          onClick={() => toggleOverlay("details")}
          aria-pressed={overlay === "details"}
          aria-label={overlay === "details" ? "Close details" : "Show details"}
          title={overlay === "details" ? "Close details" : "Details"}
          className={railIconClass(overlay === "details")}
        >
          <DetailsGlyph />
        </button>
      </div>
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
        {map?.hidePin ? (
          <ListingLocationMap
            latitude={map.latitude}
            longitude={map.longitude}
            addressQuery={map.addressQuery}
            hidePin
            hideLabel
            outlineTown={map.outlineTown}
            defaultZoom={map.defaultZoom}
            variant="hero"
            className="h-full"
          />
        ) : (
          <ShowcaseCompsMap
            mlsId={mlsId}
            subject={subject}
            townHint={townHint}
            postalCode={postalCode}
            expanded={mapExpanded}
            onToggleExpanded={() => setExpanded(!mapExpanded)}
            onExit={() => setOverlay(null)}
            fetchUrl={compsFetchUrl}
            uagFetchUrl={uagFetchUrl}
            hideSubject={map?.hidePin ?? false}
          />
        )}
      </div>
    </div>
  ) : null;

  /**
   * Its own tile rather than a `figurePill`: the two chips are real buttons,
   * which cannot be nested inside the tile's own button element.
   */
  const compsPill = (() => {
    if (revealed !== "comps") {
      return (
        <div className="flex w-full flex-col items-end">
          <button
            type="button"
            onClick={() => setRevealed("comps")}
            aria-label="Comps"
            title="Comps"
            className={railIconClass(false)}
          >
            <CompsGlyph />
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
            className="inline-flex shrink-0 items-center transition-colors hover:text-gold"
          >
            <span className="mr-2.5 inline-flex">
              <CompsGlyph />
            </span>
            Comps
          </button>
          {counts ? (
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
          ) : null}
          <MinimizeGlyphButton
            label="Hide comps"
            onClick={() => setRevealed(null)}
          />
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
              <span className="mr-2.5 inline-flex">
                {overlay === "insight" ? (
                  <InsightGlyph />
                ) : overlay === "pulse" ? (
                  <PulseGlyph />
                ) : (
                  <DetailsGlyph />
                )}
              </span>
              <span className="flex-1">
                {overlay === "insight"
                  ? "Insight"
                  : overlay === "pulse"
                    ? "Town pulse"
                    : "Details"}
              </span>
              <Chevron open />
            </button>
            {overlay === "details" ? (
              <DetailsOverlayTabs tab={detailsTab} onChange={setDetailsTab} />
            ) : null}
            <div className="max-h-[70vh] w-full overflow-y-auto overscroll-contain bg-[#0d1424]/85 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md">
              {overlay === "details" ? (
                detailsTab === "summary" ? (
                  <dl className="divide-y divide-white/10 px-4">
                    {detailRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-4 py-2"
                      >
                        <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                          {row.label}
                        </dt>
                        <dd className="text-right text-sm text-white/90">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  /* The dashboard's own Details card — same component the
                     deck below the photo renders. */
                  <ListingSidebar details={detailsPanelProps} />
                )
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
        {compsPill}

        <ShowcaseStepArrow direction="next" label="Next photo" onClick={onNext} />

        {figurePill(
          "if",
          "What if",
          <WhatIfGlyph />,
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
