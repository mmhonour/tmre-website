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
import ShowcaseTownPulse, {
  resolveShowcasePulseCity,
  showcaseTownPulseUrl,
} from "@/components/listing/showcase/ShowcaseTownPulse";
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
import { useShowcasePhoneViewport } from "@/components/listing/showcase/ShowcasePhotoFocus";
import type { ShowcaseMapPresentation } from "@/components/listing/showcase/showcase-host";
import { ListingShowcasePriceBlock } from "@/components/listing/showcase/ListingShowcasePriceBlock";
import { listingShowcaseWashClass } from "@/components/listing/showcase/listing-showcase-wash";
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
import { loadTabJson, prefetchTabJson } from "@/lib/tab-data-prefetch";
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";

type DetailsTab = "full" | "other";
type RailDeck = "insight" | "details" | "pulse" | "map";
type FigureId = "comps" | "if";

const RAIL_WIDTH = "w-[min(24rem,calc(100vw-3rem))]";
/** Shared pop-out — leaves a glyph gutter so the rail hugs the card’s left edge. */
const CARD_WIDTH = "w-[min(24rem,calc(100vw-3.75rem))]";
const CARD_RIGHT = "right-[min(24rem,calc(100vw-3.75rem))]";
/** Same gap between every rail tile, including Comps ↔ arrow ↔ What if. */
const RAIL_GAP = "gap-3";
/**
 * Half the 3.5rem photo arrow plus one RAIL_GAP (0.75rem) so tiles sit off
 * the arrow by the same amount they sit off each other.
 */
const ARROW_CLEAR = "2.5rem";

/** Shared tile geometry; `interactive` adds the hover the whole-row tiles use. */
const railRowClass = (opts: {
  open?: boolean;
  fullWidth?: boolean;
  /** Comps / What if — grow in place, never stretch like a deck. */
  fit?: boolean;
  interactive?: boolean;
  /** Expanded Comps / What if — solid navy so the photo cannot read through. */
  opaque?: boolean;
}) =>
  `relative flex items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    // `w-fit` rather than `w-auto`: a block-level flex box with auto width
    // still stretches to its container.
    opts.fit ? "w-fit max-w-full" : opts.fullWidth ? "w-full" : "w-fit lg:w-full"
  } ${opts.opaque ? "bg-[#0d1424]" : listingShowcaseWashClass} ${
    opts.open
      ? "text-white"
      : `text-white/85 ${
          opts.interactive === false ? "" : "hover:text-white"
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

/** Icon-only rail control — same side-faded navy wash as address / price. */
const railIconClass = (on: boolean) =>
  `relative inline-flex h-11 min-w-[2.75rem] items-center justify-center px-3 ${listingShowcaseWashClass} shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors ${
    on ? "text-white" : "text-white/85 hover:text-white"
  }`;

/** Labeled rail pill — glyph + original word, width of the text. */
const railLabelClass = (on: boolean) =>
  `relative flex w-fit items-center gap-2 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] ${listingShowcaseWashClass} shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    on ? "text-white" : "text-white/85 hover:text-white"
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
      <span className="relative">{glyph}</span>
      {showLabel ? <span className="relative">{label}</span> : null}
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
      <span className="relative">
        {expanded ? <MinimizeGlyph /> : <MaximizeGlyph />}
      </span>
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
      className="flex w-full shrink-0 justify-start gap-0.5 bg-[#0d1424] px-3 pt-2"
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
  fit,
}: {
  title: string;
  onCollapse: () => void;
  onTitleClick?: () => void;
  afterTitle?: ReactNode;
  children?: ReactNode;
  /** Town pulse — hug the metrics; do not fill a scroll viewport. */
  fit?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col ${fit ? "h-auto" : "h-full min-h-0"}`}
    >
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
 * arrow stays vertically opposite the previous arrow. Offered at / Closed at
 * sits in the top-right, same band as status (phone: one raised row, price
 * flush to the screen edge). Desktop: Maximize, Insight, Details, then Comps
 * sit above the right photo arrow; What if, Pulse, and Map sit below. Phone:
 * Maximize drops under Map so the headline has the top band. One even gap
 * through the column. One deck at a time occupies the center-right of the
 * bleed, above the type. Comps and What if expand in place and can stay open
 * with each other and with a deck. They stay `w-fit` in the glyph stack —
 * other icons do not shift left. On a phone, opening either one closes the
 * deck so the pills have room, leftover glyphs stay on the deck’s right
 * edge, and min/max hides while a deck is up.
 */
export default function ShowcaseSectionRail({
  mlsId,
  price = null,
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
  /** Offered at / Closed at — desktop top-right. Phone renders it in the header row. */
  price?: { label: string; amount: string } | null;
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
   * Decks (Insight / Details / Pulse / Map) are exclusive. Comps and What if
   * expand in place and may both be open, including next to a deck.
   */
  const [deck, setDeckState] = useState<RailDeck | null>(null);
  const [figures, setFigures] = useState<ReadonlySet<FigureId>>(new Set());
  const [mapExpanded, setMapExpanded] = useState(false);
  const corridors = useLocationEstimateOverlay();
  const phone = useShowcasePhoneViewport();
  const hideLabels = phone && deck != null;

  const reportClearance = (next: RailDeck | null, expanded: boolean) => {
    onMapStateChange?.({
      open: next != null,
      expanded: next === "map" && expanded,
      kind: next === "map" ? "map" : next != null ? "insight" : null,
    });
  };

  const setDeck = (next: RailDeck | null) => {
    if (next !== "map") setMapExpanded(false);
    setDeckState(next);
    reportClearance(next, next === "map" ? mapExpanded : false);
  };
  const toggleDeck = (id: RailDeck) => setDeck(deck === id ? null : id);
  const toggleFigure = (id: FigureId) => {
    // Phone: a deck eats the width the pills need — collapse it first.
    if (phone && deck) setDeck(null);
    setFigures((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setExpanded = (expanded: boolean) => {
    setMapExpanded(expanded);
    reportClearance(deck, expanded);
  };
  const pulseCity = resolveShowcasePulseCity(townHint);
  useEffect(() => {
    if (!pulseCity) return;
    prefetchTabJson(showcaseTownPulseUrl(pulseCity));
  }, [pulseCity]);

  const [detailsTab, setDetailsTab] = useState<DetailsTab>("full");
  const [labelsMax, setLabelsMax] = useState(false);
  const showLabel = labelsMax && !hideLabels;
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
      showLabel={showLabel}
      on={deck === "insight"}
      onClick={() => toggleDeck("insight")}
      ariaLabel={deck === "insight" ? "Close insight" : "Show insight"}
    />
  );

  const detailsButton = (
    <RailControl
      label="Details"
      glyph={<DetailsGlyph />}
      showLabel={showLabel}
      on={deck === "details"}
      onClick={() => toggleDeck("details")}
      ariaLabel={deck === "details" ? "Close details" : "Show details"}
    />
  );

  const pulseButton = (
    <RailControl
      label="Pulse"
      glyph={<PulseGlyph />}
      showLabel={showLabel}
      on={deck === "pulse"}
      onClick={() => toggleDeck("pulse")}
      ariaLabel={deck === "pulse" ? "Close town pulse" : "Show town pulse"}
    />
  );

  const mapButton = (
    <RailControl
      label="Map"
      glyph={<MapGlyph />}
      showLabel={showLabel}
      on={deck === "map"}
      onClick={() => toggleDeck("map")}
      ariaLabel={deck === "map" ? "Close map" : "Open map"}
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
    <div className="relative min-h-0 w-full flex-1">
      {/* Absolute fill: DealBoardMap / ListingLocationMap size via
          ResizeObserver. In-flow `h-full` under a flex-1 parent collapses
          to 0×0; the overlay widgets are `absolute` so they still paint. */}
      <div className="absolute inset-0">
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
            className="h-full w-full"
          />
        ) : (
          <ShowcaseCompsMap
            mlsId={mlsId}
            subject={subject}
            townHint={townHint}
            postalCode={postalCode}
            expanded={mapExpanded}
            onToggleExpanded={() => setExpanded(!mapExpanded)}
            onExit={() => setDeck(null)}
            fetchUrl={compsFetchUrl}
            uagFetchUrl={uagFetchUrl}
            hideSubject={map?.hidePin ?? false}
          />
        )}
      </div>
    </div>
  );

  const mapChrome = (
    <CardChrome
      title="Map"
      onCollapse={() => setDeck(null)}
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

  const compsPill = figures.has("comps") ? (
    <div className="flex w-fit max-w-full flex-col items-end">
      <div
        className={`${railRowClass({ interactive: false, fit: true, opaque: true })} gap-2`}
      >
        <button
          type="button"
          onClick={() => scrollToShowcaseSection("comps")}
          className="inline-flex shrink-0 items-center underline decoration-white/35 underline-offset-4 transition-colors hover:text-gold hover:decoration-gold/60"
        >
          Comps
        </button>
        {compsChips}
        <CollapseArrow
          label="Hide comps"
          onClick={() => toggleFigure("comps")}
        />
      </div>
    </div>
  ) : (
    <RailControl
      label="Comps"
      glyph={<CompsGlyph />}
      showLabel={showLabel}
      onClick={() => toggleFigure("comps")}
    />
  );

  const whatIfPill = figures.has("if") ? (
    <div className="flex w-fit max-w-full flex-col items-end">
      <div
        className={`${railRowClass({ interactive: false, fit: true, opaque: true })} gap-2`}
      >
        <button
          type="button"
          onClick={() => scrollToShowcaseSection("if")}
          className="inline-flex shrink-0 items-center underline decoration-white/35 underline-offset-4 transition-colors hover:text-gold hover:decoration-gold/60"
        >
          What if
        </button>
        {whatIfChips}
        <CollapseArrow
          label="Hide What if"
          onClick={() => toggleFigure("if")}
        />
      </div>
    </div>
  ) : (
    <RailControl
      label="What if"
      glyph={<WhatIfGlyph />}
      showLabel={showLabel}
      onClick={() => toggleFigure("if")}
    />
  );

  const openCard =
    deck === "insight" ? (
      <CardChrome title="Insight" onCollapse={() => setDeck(null)}>
        <div className="min-h-0 w-full flex-1 overflow-y-auto bg-[#0d1424] p-4">
          <ShowcaseInsightBody insight={insight} facts={insightFacts ?? null} />
        </div>
      </CardChrome>
    ) : deck === "details" ? (
      <CardChrome title="Details" onCollapse={() => setDeck(null)}>
        <DetailsOverlayTabs tab={detailsTab} onChange={setDetailsTab} />
        <div className="min-h-0 w-full flex-1 overflow-y-auto bg-[#0d1424]">
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
    ) : deck === "pulse" ? (
      <CardChrome title="Town pulse" onCollapse={() => setDeck(null)} fit>
        <div className="w-full bg-[#0d1424] p-4">
          <ShowcaseTownPulse city={pulseCity} expanded />
        </div>
      </CardChrome>
    ) : deck === "map" ? (
      mapChrome
    ) : null;

  const mapFullscreen = deck === "map" && mapExpanded;
  const railRight = mapFullscreen
    ? "max-lg:hidden lg:right-[min(50vw,44rem)]"
    : deck && !phone
      ? CARD_RIGHT
      : "right-0";

  return (
    <>
      {/*
       * Glyph column above the type (z-30). Phone: the deck sits in this
       * column so leftover glyphs stay on its right edge. Desktop: the deck
       * is a separate center-right panel and the column shifts left.
       */}
      <div
        className={`pointer-events-none absolute inset-y-0 z-30 ${RAIL_WIDTH} ${railRight}`}
      >
        {price ? (
          <div className="pointer-events-auto absolute top-0 right-0 z-10 hidden pt-24 pr-3 sm:pr-6 lg:block lg:pt-28">
            <ListingShowcasePriceBlock
              label={price.label}
              amount={price.amount}
            />
          </div>
        ) : null}
        <div
          className={`pointer-events-auto absolute bottom-1/2 right-0 flex flex-col items-end ${RAIL_GAP} pr-3 sm:pr-6`}
          style={{ paddingBottom: ARROW_CLEAR }}
        >
          {hideLabels ? null : (
            <div className="max-lg:hidden">
              <RailMinMaxButton
                expanded={labelsMax}
                onToggle={() => setLabelsMax((open) => !open)}
              />
            </div>
          )}
          {deck === "insight" ? null : insightButton}
          {deck === "details" ? null : detailsButton}
          {compsPill}
        </div>
        <div
          className={`pointer-events-auto absolute top-1/2 right-0 flex flex-col items-end ${RAIL_GAP} pr-3 sm:pr-6`}
          style={{ paddingTop: ARROW_CLEAR }}
        >
          {whatIfPill}
          {deck === "pulse" ? null : pulseButton}
          {deck === "map" ? null : mapButton}
          {hideLabels ? null : (
            <div className="lg:hidden">
              <RailMinMaxButton
                expanded={labelsMax}
                onToggle={() => setLabelsMax((open) => !open)}
              />
            </div>
          )}
        </div>
        {phone && deck && !mapFullscreen ? (
          <div
            className={`pointer-events-auto absolute left-0 right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col bg-[#0d1424] pr-3 sm:pr-6 ${
              deck === "pulse"
                ? "h-auto"
                : "h-[min(28rem,calc(100dvh-18rem))] overflow-hidden"
            }`}
          >
            {openCard}
          </div>
        ) : null}
      </div>
      {deck && !mapFullscreen && !phone ? (
        <div className="pointer-events-none absolute bottom-24 right-0 top-28 z-30 flex items-center justify-end pr-3 sm:pr-6">
          <div
            className={`pointer-events-auto flex ${CARD_WIDTH} flex-col bg-[#0d1424] ${
              deck === "pulse"
                ? "h-auto"
                : "h-[min(32rem,calc(100dvh-14rem))] overflow-hidden"
            }`}
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
