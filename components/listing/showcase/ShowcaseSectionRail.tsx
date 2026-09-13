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

type DetailsTab = "full" | "other";

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
      className="flex w-full items-stretch bg-[#0d1424]"
    >
      {(["full", "other"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onChange(id)}
          className={`min-w-0 flex-1 px-3 py-1.5 text-left font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
            id === "full" ? "rounded-tl-md" : "rounded-tr-md"
          } ${
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
  children,
}: {
  title: string;
  onCollapse: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-end">
      <div className={`${pillClass(true, true)} bg-[#0d1424]`}>
        <span className="flex-1">{title}</span>
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
 * What if sit above that arrow; Details, Pulse, and Map sit below. A tap
 * replaces the symbol with a card; ↑ on the card restores the symbol. The
 * min/max control expands every icon to its word, or collapses them back.
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
  };
  const toggleOverlay = (id: "insight" | "map" | "pulse" | "details") =>
    setOverlay(overlay === id ? null : id);
  const setExpanded = (expanded: boolean) => {
    setMapExpanded(expanded);
    onMapStateChange?.({ open: overlay === "map", expanded });
  };
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("full");
  const [revealed, setRevealed] = useState<string | null>(null);
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
        <div className="flex w-fit max-w-full flex-col items-end">
          <div
            className={`${railRowClass({ interactive: false, fullWidth: true })} gap-2 bg-[#0d1424]`}
          >
            <button
              type="button"
              onClick={onActivate}
              className="flex min-w-0 flex-1 items-center text-left transition-colors hover:text-gold"
            >
              <span className="shrink-0">{label}</span>
              {figures ? (
                <span className="ml-3 flex flex-1 items-center justify-end gap-3 whitespace-nowrap normal-case tracking-[0.08em] text-white">
                  {figures}
                </span>
              ) : null}
            </button>
            <CollapseArrow
              label={`Hide ${label}`}
              onClick={() => setRevealed(null)}
            />
          </div>
        </div>
      );
    }
    return (
      <RailControl
        label={label}
        glyph={glyph}
        showLabel={labelsMax}
        onClick={() => setRevealed(id)}
      />
    );
  };

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

  const insightCard =
    overlay === "insight" ? (
      <CardChrome title="Insight" onCollapse={() => setOverlay(null)}>
        <div className="max-h-[40vh] w-full overflow-y-auto bg-[#0d1424] p-4">
          <ShowcaseInsightBody insight={insight} facts={insightFacts ?? null} />
        </div>
      </CardChrome>
    ) : null;

  const detailsCard =
    overlay === "details" ? (
      <CardChrome title="Details" onCollapse={() => setOverlay(null)}>
        <DetailsOverlayTabs tab={detailsTab} onChange={setDetailsTab} />
        <div className="max-h-[40vh] w-full overflow-y-auto bg-[#0d1424]">
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
    ) : null;

  const pulseCard =
    overlay === "pulse" ? (
      <CardChrome title="Town pulse" onCollapse={() => setOverlay(null)}>
        <div className="max-h-[40vh] w-full overflow-y-auto bg-[#0d1424] p-4">
          <ShowcaseTownPulse city={townHint ?? ""} expanded />
        </div>
      </CardChrome>
    ) : null;

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
      className={`flex flex-col bg-[#0d1424] max-lg:fixed max-lg:inset-0 max-lg:z-[60] lg:absolute lg:bottom-0 lg:right-16 lg:top-28 lg:z-30 ${
        mapExpanded ? "lg:w-[min(50vw,44rem)]" : "lg:w-96"
      }`}
    >
      <CardChrome title="Map" onCollapse={() => setOverlay(null)} />
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
        <RailControl
          label="Comps"
          glyph={<CompsGlyph />}
          showLabel={labelsMax}
          onClick={() => setRevealed("comps")}
        />
      );
    }
    return (
      <div className="flex w-fit max-w-full flex-col items-end">
        <div className={`${railRowClass({ interactive: false, fullWidth: true })} gap-2 bg-[#0d1424]`}>
          <button
            type="button"
            onClick={() => scrollToShowcaseSection("comps")}
            className="inline-flex shrink-0 items-center transition-colors hover:text-gold"
          >
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
          <CollapseArrow
            label="Hide comps"
            onClick={() => setRevealed(null)}
          />
        </div>
      </div>
    );
  })();

  const aboveIcons = (
    <div className="flex flex-col items-end gap-1">
      <RailMinMaxButton
        expanded={labelsMax}
        onToggle={() => setLabelsMax((open) => !open)}
      />
      {overlay === "insight" ? insightCard : insightButton}
      {compsPill}
      {figurePill(
        "if",
        "What if",
        <WhatIfGlyph />,
        ifLabel ? <span>{ifLabel}</span> : null,
        () => scrollToShowcaseSection("if"),
      )}
    </div>
  );

  const belowIcons = (
    <div className="flex flex-col items-end gap-1">
      {overlay === "details" ? detailsCard : detailsButton}
      {overlay === "pulse" ? pulseCard : pulseButton}
      {overlay === "map" ? null : mapButton}
    </div>
  );

  return (
    <>
      {mapOverlay}
      {/*
       * Full-height column so the middle gap lines up with the left/right
       * photo arrows. Insight / Comps / What if stack above; Details / Pulse /
       * Map sit below. Min/max expands every icon to its word.
       */}
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-20 flex ${RAIL_WIDTH} flex-col items-end pr-3 sm:pr-6`}
      >
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col items-end justify-end gap-1 overflow-y-auto pb-1">
          {aboveIcons}
        </div>
        <div className="h-14 shrink-0" aria-hidden />
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col items-end justify-start gap-1 overflow-y-auto pt-1">
          {belowIcons}
        </div>
      </div>
    </>
  );
}
