"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import {
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SALE_ON_MARKET_PANEL_ID,
} from "@/components/listing/listing-section-ids";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseInsightBody from "@/components/listing/showcase/ShowcaseInsightBody";
import ShowcaseTownPulse from "@/components/listing/showcase/ShowcaseTownPulse";
import {
  CompsGlyph,
  DetailsGlyph,
  InsightGlyph,
  MapGlyph,
  MaximizeGlyph,
  MinimizeGlyph,
  PulseGlyph,
  WhatIfGlyph,
} from "@/components/listing/showcase/showcase-rail-glyphs";
import type { ShowcaseMapPresentation } from "@/components/listing/showcase/showcase-host";
import {
  jumpToIfScenario,
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
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";

type DetailsTab = "full" | "other";
type RailCard = "insight" | "comps" | "if" | "details" | "pulse" | "map";

const RAIL_WIDTH = "w-[min(24rem,calc(100vw-3rem))]";
/** Shared pop-out — leaves a glyph gutter so the rail hugs the card’s left edge. */
const CARD_WIDTH = "w-[min(24rem,calc(100vw-3.75rem))]";
const CARD_RIGHT = "right-[min(24rem,calc(100vw-3.75rem))]";

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
  value,
  onClick,
}: {
  label: string;
  value: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 bg-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65 transition-colors hover:bg-white/20 hover:text-white"
    >
      {label}
      <span className="tabular-nums normal-case tracking-[0.08em] text-white">
        {value}
      </span>
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

/** Labeled rail pill — glyph + original word, width of the text. */
const railLabelClass = (on: boolean) =>
  `flex w-fit items-center gap-2 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    on
      ? "bg-navy text-white"
      : "bg-[#0d1424]/85 text-white/85 hover:bg-navy hover:text-white"
  }`;

function RailControl({
  label,
  glyph,
  showLabel,
  on,
  onClick,
  ariaLabel,
}: {
  label: string;
  glyph: ReactNode;
  showLabel: boolean;
  on?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={ariaLabel ?? label}
      title={label}
      className={showLabel ? railLabelClass(!!on) : railIconClass(!!on)}
    >
      {glyph}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

function RailMinMaxButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={expanded}
      aria-label={expanded ? "Show icons only" : "Show icon names"}
      title={expanded ? "Minimize to icons" : "Maximize labels"}
      className={railIconClass(expanded)}
    >
      {expanded ? <MinimizeGlyph /> : <MaximizeGlyph />}
    </button>
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
    <div
      role="tablist"
      className="flex w-full justify-start gap-0.5 bg-[#0d1424] px-3 pt-2"
    >
      {(["full", "other"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onChange(id)}
          className={`w-fit shrink-0 rounded-t-md px-3 py-1.5 text-left font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
            tab === id
              ? "bg-gold text-navy"
              : "bg-gold/25 text-gold hover:bg-gold/40 hover:text-navy"
          }`}
        >
          {id === "full" ? "Full" : "Other"}
        </button>
      ))}
    </div>
  );
}

function CollapseArrow({
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
      ↑
    </button>
  );
}

function CardChrome({
  title,
  onCollapse,
  onTitleClick,
  afterTitle,
  children,
}: {
  title: string;
  onCollapse: () => void;
  onTitleClick?: () => void;
  afterTitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-end">
      <div className={`${pillClass(true, true)} shrink-0 bg-[#0d1424]`}>
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="underline decoration-white/35 underline-offset-4 transition-colors hover:text-gold hover:decoration-gold/60"
          >
            {title}
          </button>
        ) : (
          <span>{title}</span>
        )}
        {afterTitle}
        <span className="flex-1" />
        <CollapseArrow label={`Hide ${title}`} onClick={onCollapse} />
      </div>
      {children}
    </div>
  );
}

type CompsCounts = { active: number; sold: number; soldMonths: number };
type IfAmounts = { sale: number | null; rent: number | null };

/**
 * Rail of flush rectangular tiles over the right of the photo. The next-photo
 * arrow stays vertically opposite the previous arrow. Insight, Comps, then
 * What if sit above that arrow; Details, Pulse, and Map sit below. One
 * card at a time occupies the center-right of the bleed, above the type,
 * with leftover glyphs on its left edge. ↑ restores the glyph. The min/max
 * control expands every icon to its word, or collapses them back.
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
  onMapStateChange,
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
  /** Lets the hero shift Offered at / Closed at clear of Insight or Map. */
  onMapStateChange?: (state: {
    open: boolean;
    expanded: boolean;
    kind: "map" | "insight" | null;
  }) => void;
  compsFetchUrl?: string | null;
  uagFetchUrl?: string | null;
  /** Spotlight privacy: town-outline map instead of comps + pin. */
  map?: ShowcaseMapPresentation | null;
}) {
  /**
   * One exclusive pop-out. Comps and What if use the same center-right slot
   * as Insight / Details / Pulse / Map.
   */
  const [overlay, setOverlayState] = useState<RailCard | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const corridors = useLocationEstimateOverlay();

  const reportClearance = (next: RailCard | null, expanded: boolean) => {
    onMapStateChange?.({
      open: next != null,
      expanded: next === "map" && expanded,
      kind: next === "map" ? "map" : next != null ? "insight" : null,
    });
  };

  const setOverlay = (next: RailCard | null) => {
    if (next !== "map") setMapExpanded(false);
    setOverlayState(next);
    reportClearance(next, next === "map" ? mapExpanded : false);
  };
  const toggleOverlay = (id: RailCard) =>
    setOverlay(overlay === id ? null : id);
  const setExpanded = (expanded: boolean) => {
    setMapExpanded(expanded);
    reportClearance(overlay, expanded);
  };
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("full");
  const [labelsMax, setLabelsMax] = useState(false);
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

  const insightButton = (
    <RailControl
      label="Insight"
      glyph={<InsightGlyph />}
      showLabel={labelsMax}
      on={overlay === "insight"}
      onClick={() => toggleOverlay("insight")}
      ariaLabel={overlay === "insight" ? "Close insight" : "Show insight"}
    />
  );

  const compsButton = (
    <RailControl
      label="Comps"
      glyph={<CompsGlyph />}
      showLabel={labelsMax}
      on={overlay === "comps"}
      onClick={() => toggleOverlay("comps")}
      ariaLabel={overlay === "comps" ? "Close comps" : "Show comps"}
    />
  );

  const whatIfButton = (
    <RailControl
      label="What if"
      glyph={<WhatIfGlyph />}
      showLabel={labelsMax}
      on={overlay === "if"}
      onClick={() => toggleOverlay("if")}
      ariaLabel={overlay === "if" ? "Close What if" : "Show What if"}
    />
  );

  const detailsButton = (
    <RailControl
      label="Details"
      glyph={<DetailsGlyph />}
      showLabel={labelsMax}
      on={overlay === "details"}
      onClick={() => toggleOverlay("details")}
      ariaLabel={overlay === "details" ? "Close details" : "Show details"}
    />
  );

  const pulseButton = (
    <RailControl
      label="Pulse"
      glyph={<PulseGlyph />}
      showLabel={labelsMax}
      on={overlay === "pulse"}
      onClick={() => toggleOverlay("pulse")}
      ariaLabel={overlay === "pulse" ? "Close town pulse" : "Show town pulse"}
    />
  );

  const mapButton = (
    <RailControl
      label="Map"
      glyph={<MapGlyph />}
      showLabel={labelsMax}
      on={overlay === "map"}
      onClick={() => toggleOverlay("map")}
      ariaLabel={overlay === "map" ? "Close map" : "Open map"}
    />
  );

  const compsChips = counts ? (
    <span className="ml-2 flex items-center gap-1">
      <CountChip
        label="On market"
        value={counts.active}
        onClick={() => jumpToListingSection(LISTING_SALE_ON_MARKET_PANEL_ID)}
      />
      <CountChip
        label={`Sold ${counts.soldMonths} in mos`}
        value={counts.sold}
        onClick={() => jumpToListingSection(LISTING_RECENTLY_SOLD_PANEL_ID)}
      />
    </span>
  ) : null;

  const sale =
    amounts?.sale != null ? fmtIfSaleMoney(amounts.sale) : null;
  const rent =
    amounts?.rent != null
      ? fmtIfRentMoney(roundIfRentMidpoint(amounts.rent))
      : null;
  const whatIfChips =
    sale || rent ? (
      <span className="ml-2 flex items-center gap-1">
        {sale ? (
          <CountChip
            label="Sale"
            value={sale}
            onClick={() => jumpToIfScenario("sale")}
          />
        ) : null}
        {rent ? (
          <CountChip
            label="Rent"
            value={rent}
            onClick={() => jumpToIfScenario("rent")}
          />
        ) : null}
      </span>
    ) : null;

  const mapBody = (
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
  );

  const mapChrome = (
    <CardChrome
      title="Map"
      onCollapse={() => setOverlay(null)}
      afterTitle={
        corridors.unlocked ? (
          <button
            type="button"
            onClick={() => void corridors.setEnabled(!corridors.enabled)}
            disabled={corridors.busy}
            aria-pressed={corridors.enabled}
            className={`ml-2 shrink-0 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
              corridors.enabled
                ? "bg-sky/20 text-sky"
                : "text-white/50 hover:text-white"
            }`}
          >
            Corridors
          </button>
        ) : null
      }
    >
      {mapBody}
    </CardChrome>
  );

  const openCard =
    overlay === "insight" ? (
      <CardChrome title="Insight" onCollapse={() => setOverlay(null)}>
        <div className="min-h-0 w-full overflow-y-auto bg-[#0d1424] p-4">
          <ShowcaseInsightBody insight={insight} facts={insightFacts ?? null} />
        </div>
      </CardChrome>
    ) : overlay === "comps" ? (
      <CardChrome
        title="Comps"
        onTitleClick={() => scrollToShowcaseSection("comps")}
        onCollapse={() => setOverlay(null)}
        afterTitle={compsChips}
      />
    ) : overlay === "if" ? (
      <CardChrome
        title="What if"
        onTitleClick={() => scrollToShowcaseSection("if")}
        onCollapse={() => setOverlay(null)}
        afterTitle={whatIfChips}
      />
    ) : overlay === "details" ? (
      <CardChrome title="Details" onCollapse={() => setOverlay(null)}>
        <DetailsOverlayTabs tab={detailsTab} onChange={setDetailsTab} />
        <div className="min-h-0 w-full overflow-y-auto bg-[#0d1424]">
          {detailsTab === "full" ? (
            <div className="p-3">
              <ListingSidebar details={detailsPanelProps} unframed />
            </div>
          ) : (
            <dl className="divide-y divide-white/10 px-4">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                    {row.label}
                  </dt>
                  <dd className="text-right text-sm text-white/90">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </CardChrome>
    ) : overlay === "pulse" ? (
      <CardChrome title="Town pulse" onCollapse={() => setOverlay(null)}>
        <div className="min-h-0 w-full overflow-y-auto bg-[#0d1424] p-4">
          <ShowcaseTownPulse city={townHint ?? ""} expanded />
        </div>
      </CardChrome>
    ) : overlay === "map" ? (
      mapChrome
    ) : null;

  const mapFullscreen = overlay === "map" && mapExpanded;
  const railRight = mapFullscreen
    ? "max-lg:hidden lg:right-[min(50vw,44rem)]"
    : overlay
      ? CARD_RIGHT
      : "right-0";

  return (
    <>
      {/*
       * Glyph column above the type (z-30). The photo arrow gap stays in the
       * middle. An open card sits in the center-right band; leftovers hug it.
       */}
      <div
        className={`pointer-events-none absolute inset-y-0 z-30 flex ${RAIL_WIDTH} flex-col items-end pr-3 sm:pr-6 ${railRight}`}
      >
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col items-end justify-end gap-1 overflow-visible pb-1">
          <RailMinMaxButton
            expanded={labelsMax}
            onToggle={() => setLabelsMax((open) => !open)}
          />
          {overlay === "insight" ? null : insightButton}
          {overlay === "comps" ? null : compsButton}
          {overlay === "if" ? null : whatIfButton}
        </div>
        <div className="h-14 shrink-0" aria-hidden />
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col items-end justify-start gap-1 overflow-visible pt-1">
          {overlay === "details" ? null : detailsButton}
          {overlay === "pulse" ? null : pulseButton}
          {overlay === "map" ? null : mapButton}
        </div>
      </div>
      {overlay && !mapFullscreen ? (
        <div className="pointer-events-none absolute bottom-24 right-0 top-28 z-30 flex items-center justify-end pr-3 sm:pr-6">
          <div
            className={`pointer-events-auto flex ${CARD_WIDTH} ${
              overlay === "map"
                ? "h-[min(32rem,calc(100dvh-14rem))]"
                : "max-h-full"
            } flex-col overflow-hidden bg-[#0d1424]`}
          >
            {openCard}
          </div>
        </div>
      ) : null}
      {mapFullscreen ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#0d1424] lg:absolute lg:inset-auto lg:bottom-0 lg:right-0 lg:top-28 lg:z-30 lg:w-[min(50vw,44rem)]">
          {mapChrome}
        </div>
      ) : null}
    </>
  );
}
