"use client";

import { useState, type ReactNode } from "react";
import { ListingShowcasePriceBlock } from "@/components/listing/showcase/ListingShowcasePriceBlock";
import { ListingShowcaseTypeWash } from "@/components/listing/showcase/listing-showcase-wash";
import {
  CompsGlyph,
  DetailsGlyph,
  InsightGlyph,
  MapGlyph,
  MaximizeGlyph,
  MinimizeGlyph,
  PulseGlyph,
  SHOWCASE_RAIL_GLYPH_PROPOSAL,
  WhatIfGlyph,
} from "@/components/listing/showcase/showcase-rail-glyphs";

const railRow =
  "flex w-fit items-center justify-start bg-[#0d1424]/85 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)]";

const railIcon =
  "inline-flex h-11 w-11 items-center justify-center bg-[#0d1424]/85 text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)]";

const railLabel =
  "flex w-fit items-center gap-2 bg-[#0d1424]/85 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)]";

function Glyph({ id }: { id: string }) {
  switch (id) {
    case "insight":
      return <InsightGlyph />;
    case "details":
      return <DetailsGlyph />;
    case "comps":
      return <CompsGlyph />;
    case "what-if":
      return <WhatIfGlyph />;
    case "map":
      return <MapGlyph />;
    case "pulse":
      return <PulseGlyph />;
    default:
      return null;
  }
}

function CountChip({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 bg-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65">
      {label}
      <span className="tabular-nums text-white">{count}</span>
    </span>
  );
}

function DemoControl({
  label,
  glyph,
  showLabel,
  onClick,
  testId,
}: {
  label: string;
  glyph: ReactNode;
  showLabel: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const className = showLabel ? railLabel : railIcon;
  const inner = (
    <>
      {glyph}
      {showLabel ? <span>{label}</span> : null}
    </>
  );
  if (!onClick) {
    return (
      <span className={className} title={label}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
    >
      {inner}
    </button>
  );
}

/** Default: symbols only. Min/max reveals every word; a tap still opens a card. */
function SymbolRailDemo() {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"full" | "other">("full");
  const [labelsMax, setLabelsMax] = useState(false);

  const compsBtn =
    revealed === "comps" ? (
      <div className={`${railRow} gap-2`}>
        <span className="inline-flex items-center">
          <span className="mr-2.5 inline-flex">
            <CompsGlyph />
          </span>
          Comps
        </span>
        <span className="flex flex-1 items-center justify-end gap-1">
          <CountChip label="On market" count={6} />
          <CountChip label="Sold 12 in mos" count={21} />
        </span>
        <button
          type="button"
          data-testid="preview-comps-hide"
          onClick={() => setRevealed(null)}
          aria-label="Hide comps"
          className="ml-2 shrink-0 px-1 font-mono text-white/70 hover:text-white"
        >
          ↑
        </button>
      </div>
    ) : (
      <DemoControl
        label="Comps"
        glyph={<CompsGlyph />}
        showLabel={labelsMax}
        testId="preview-comps-open"
        onClick={() => setRevealed("comps")}
      />
    );

  const ifBtn =
    revealed === "if" ? (
      <div className={`${railRow} gap-2`}>
        <span className="flex min-w-0 flex-1 items-center">
          <span className="mr-2.5 inline-flex">
            <WhatIfGlyph />
          </span>
          <span className="shrink-0">What if</span>
          <span className="ml-3 whitespace-nowrap normal-case tracking-[0.08em] text-white">
            $1.4M / $6,200
          </span>
        </span>
        <button
          type="button"
          data-testid="preview-if-hide"
          onClick={() => setRevealed(null)}
          aria-label="Hide What if"
          className="ml-2 shrink-0 px-1 font-mono text-white/70 hover:text-white"
        >
          ↑
        </button>
      </div>
    ) : (
      <DemoControl
        label="What if"
        glyph={<WhatIfGlyph />}
        showLabel={labelsMax}
        testId="preview-if-open"
        onClick={() => setRevealed("if")}
      />
    );

  return (
    <div className="flex min-h-[22rem] flex-col items-end">
      <div
        className="mb-3 w-full transition-[padding] duration-300"
        style={
          insightOpen
            ? { paddingRight: "min(24rem, calc(100% - 3rem))" }
            : undefined
        }
      >
        <div className="flex justify-end">
          <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-end justify-end gap-1 pb-1">
        <button
          type="button"
          data-testid="preview-rail-minmax"
          onClick={() => setLabelsMax((open) => !open)}
          aria-pressed={labelsMax}
          aria-label={labelsMax ? "Show icons only" : "Show icon names"}
          title={labelsMax ? "Minimize to icons" : "Maximize labels"}
          className={railIcon}
        >
          {labelsMax ? <MinimizeGlyph /> : <MaximizeGlyph />}
        </button>
        {insightOpen ? (
          <div className="w-full max-w-sm bg-[#0d1424]">
            <div className={`${railRow} w-full bg-[#0d1424]`}>
              <span className="flex-1">Insight</span>
              <button
                type="button"
                data-testid="preview-insight-hide"
                onClick={() => setInsightOpen(false)}
                aria-label="Hide Insight"
                className="ml-2 px-1 font-mono text-white/70"
              >
                ↑
              </button>
            </div>
            <div className="bg-[#0d1424] px-4 py-3 text-sm text-white/85">
              Four beds on the harbor, listed this week.
            </div>
          </div>
        ) : (
          <DemoControl
            label="Insight"
            glyph={<InsightGlyph />}
            showLabel={labelsMax}
            testId="preview-insight-open"
            onClick={() => setInsightOpen(true)}
          />
        )}
        {compsBtn}
        {ifBtn}
      </div>
      <div
        className="listing-showcase-arrow flex h-14 w-14 items-center justify-center rounded-xl text-[34px] font-bold text-white"
        aria-hidden
      >
        →
      </div>
      <div className="flex flex-1 flex-col items-end justify-start gap-1 pt-1">
        {detailsOpen ? (
          <div className="w-full max-w-sm bg-[#0d1424]">
            <div className={`${railRow} w-full bg-[#0d1424]`}>
              <span className="flex-1">Details</span>
              <button
                type="button"
                data-testid="preview-details-hide"
                onClick={() => setDetailsOpen(false)}
                aria-label="Hide Details"
                className="ml-2 px-1 font-mono text-white/70"
              >
                ↑
              </button>
            </div>
            <div
              role="tablist"
              className="flex w-full justify-start gap-0.5 bg-[#0d1424] px-3 pt-2"
            >
              {(["full", "other"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={detailsTab === id}
                  data-testid={`preview-details-tab-${id}`}
                  onClick={() => setDetailsTab(id)}
                  className={`w-fit shrink-0 rounded-t-md px-3 py-1.5 text-left font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
                    detailsTab === id
                      ? "bg-gold text-navy"
                      : "bg-gold/25 text-gold"
                  }`}
                >
                  {id === "full" ? "Full" : "Other"}
                </button>
              ))}
            </div>
            <div className="bg-[#0d1424] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
              {detailsTab === "full" ? (
                <ul className="space-y-2">
                  <li>Schools · taxes · rooms</li>
                  <li>Lot 0.42 ac · 2,410 sf</li>
                  <li>Assessed $1.12M · tax $18,440</li>
                  <li>No scrollbar on this card</li>
                </ul>
              ) : (
                "Beds 4 · Baths 3 · 2,410 sf"
              )}
            </div>
          </div>
        ) : pulseOpen ? (
          <div className="w-full max-w-sm overflow-x-hidden overflow-y-hidden bg-[#0d1424]">
            <div className={`${railRow} w-full bg-[#0d1424]`}>
              <span className="flex-1">Town pulse</span>
              <button
                type="button"
                data-testid="preview-pulse-hide"
                onClick={() => setPulseOpen(false)}
                aria-label="Hide Town pulse"
                className="ml-2 px-1 font-mono text-white/70"
              >
                ↑
              </button>
            </div>
            <ul className="space-y-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
              <li>Inventory 42</li>
              <li>Months supply 3.1 mo</li>
              <li>Avg DOM 28d</li>
              <li>Closed 21 · 12 mos</li>
              <li>Median $1.85M</li>
              <li>No scrollbar on this card</li>
            </ul>
          </div>
        ) : (
          <>
            <DemoControl
              label="Details"
              glyph={<DetailsGlyph />}
              showLabel={labelsMax}
              testId="preview-details-open"
              onClick={() => setDetailsOpen(true)}
            />
            <DemoControl
              label="Pulse"
              glyph={<PulseGlyph />}
              showLabel={labelsMax}
              testId="preview-pulse-open"
              onClick={() => setPulseOpen(true)}
            />
            <DemoControl label="Map" glyph={<MapGlyph />} showLabel={labelsMax} />
          </>
        )}
      </div>
    </div>
  );
}

function MapChromeDemo() {
  const [pool, setPool] = useState<"active" | "uag" | "sold">("active");
  return (
    <div className="relative h-64 overflow-hidden bg-[#1a2744]">
      <div
        className="absolute right-0 top-3 z-10 transition-[margin]"
        style={{ marginRight: "calc(24rem + 3.5rem)" }}
      >
        <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
      </div>
      <div className="absolute bottom-4 top-4 right-[calc(24rem+0.25rem)] flex w-11 flex-col items-end justify-center gap-1">
        <span className={railIcon} title="Details">
          <DetailsGlyph />
        </span>
        <span className={railIcon} title="Pulse">
          <PulseGlyph />
        </span>
      </div>
      <div className="absolute bottom-0 right-0 top-0 flex w-96 flex-col bg-[#0d1424]">
        <div className={`${railRow} w-full bg-[#0d1424]`}>
          <span>Map</span>
          <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">
            Corridors
          </span>
          <span className="flex-1" />
          <span className="px-1 font-mono text-white/70">↑</span>
        </div>
        <div className="relative min-h-0 flex-1">
          <div className="absolute right-2 top-2 z-20 flex flex-col items-end gap-1">
            <span className="rounded-md border border-white/15 bg-[#0d1424] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/85">
              Full size
            </span>
            <div className="flex flex-col bg-[#0d1424]">
              {(
                [
                  { id: "active" as const, label: "For sale", count: 6 },
                  { id: "uag" as const, label: "UAG", count: 2 },
                  { id: "sold" as const, label: "Closed", count: 21 },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPool(p.id)}
                  className={`px-2.5 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.16em] ${
                    pool === p.id ? "bg-white/15 text-white" : "text-white/50"
                  }`}
                >
                  {p.label}
                  <span className="ml-1.5 tabular-nums text-white/40">
                    {p.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShowcaseRailPillsPreview() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 font-serif text-xl text-navy">Glyph key</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SHOWCASE_RAIL_GLYPH_PROPOSAL.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-2xl border border-charcoal/[0.08] bg-navy px-4 py-3 text-white"
            >
              <span className={railIcon}>
                <Glyph id={row.id} />
              </span>
              <span>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em]">
                  {row.label}
                </p>
                <p className="mt-0.5 text-sm text-white/65">{row.note}</p>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl text-navy">
          Full-bleed status, address, and price
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Status, street, and Offered at / Closed at sit on the same navy as
          the rail pills — strongest in the middle, transparent at the edges.
          Compact prices keep the M; labels keep At.
        </p>
        <div className="listing-showcase-type relative bg-[linear-gradient(135deg,#1a2744_0%,#0d1424_50%,#243656_100%)] px-4 py-10 sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ListingShowcaseTypeWash className="w-fit min-w-[8rem] px-8 py-1.5 text-center">
                <span className="relative font-mono text-[10px] uppercase tracking-[0.25em] text-gold">
                  Active
                </span>
              </ListingShowcaseTypeWash>
              <ListingShowcaseTypeWash className="mt-2 w-fit max-w-full px-5 py-2">
                <p className="relative font-serif text-3xl text-white">
                  12 Harbor Rd
                </p>
                <p className="relative mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">
                  Westport, CT
                </p>
              </ListingShowcaseTypeWash>
            </div>
            <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
          </div>
          <div className="mt-8 flex justify-end">
            <ListingShowcasePriceBlock label="Closed at" amount="$1.75M" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl text-navy">
          Symbols around the right arrow
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Insight, Comps, then What if stack above the right arrow. Details,
          Pulse, and Map sit below. Opening Insight shifts Offered at left of
          the card. Opening Details hides Pulse and Map so the card has no
          scrollbar. The square min/max control expands every
          icon to its word, or collapses them back. A tap still opens a card;
          ↑ restores the control. Details uses the gold folder tabs on an
          opaque navy card.
        </p>
        <div className="bg-[linear-gradient(135deg,#1a2744_0%,#0d1424_50%,#243656_100%)] px-4 py-8">
          <SymbolRailDemo />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl text-navy">
          Map — flush right, glyphs to the left
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Map sits on the page’s right edge. Rail glyphs stay to its left.
          One Corridors control sits next to the Map label (admin). Offered
          at shifts left of the map plus the glyph column. For sale, UAG,
          and Closed stack under Full size.
        </p>
        <MapChromeDemo />
      </section>
    </div>
  );
}
