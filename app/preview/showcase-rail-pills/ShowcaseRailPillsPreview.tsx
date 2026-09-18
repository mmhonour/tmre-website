"use client";

import { useMemo, useState, type ReactNode } from "react";
import DealBoardMap from "@/components/intelligence/DealBoardMap";
import { ListingShowcasePriceBlock } from "@/components/listing/showcase/ListingShowcasePriceBlock";
import { mapBoundZipsForListing } from "@/lib/tmre-towns";
import {
  ListingShowcaseTypeWash,
  listingShowcaseWashClass,
} from "@/components/listing/showcase/listing-showcase-wash";
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

const railRow = `relative flex w-fit items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] ${listingShowcaseWashClass}`;

/** Expanded Comps / What if — solid navy, same as the Insight / Details decks. */
const railRowOpaque = `relative flex w-fit items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] bg-[#0d1424]`;

const railIcon = `relative inline-flex h-11 min-w-[2.75rem] items-center justify-center px-3 text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] ${listingShowcaseWashClass}`;

const railLabel = `relative flex w-fit items-center gap-2 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] ${listingShowcaseWashClass}`;

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

function CountChip({
  label,
  count,
}: {
  label: string;
  count: number | string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 bg-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65">
      {label}
      <span className="tabular-nums normal-case tracking-[0.08em] text-white">
        {count}
      </span>
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
      <span className="relative">{glyph}</span>
      {showLabel ? <span className="relative">{label}</span> : null}
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

/** Glyphs plus in-place Comps / What if. Decks are exclusive. */
function SymbolRailDemo() {
  const [deck, setDeck] = useState<
    "insight" | "details" | "pulse" | "map" | null
  >(null);
  const [compsOpen, setCompsOpen] = useState(false);
  const [ifOpen, setIfOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"full" | "other">("full");
  const [labelsMax, setLabelsMax] = useState(false);

  const toggleDeck = (id: NonNullable<typeof deck>) =>
    setDeck((current) => (current === id ? null : id));
  const toggleComps = () => {
    if (deck) setDeck(null);
    setCompsOpen((open) => !open);
  };
  const toggleIf = () => {
    if (deck) setDeck(null);
    setIfOpen((open) => !open);
  };

  const card =
    deck === "insight" ? (
      <div className="w-full max-w-sm bg-[#0d1424]">
        <div className={`${railRow} w-full bg-[#0d1424]`}>
          <span className="flex-1">Insight</span>
          <button
            type="button"
            data-testid="preview-insight-hide"
            onClick={() => setDeck(null)}
            aria-label="Hide Insight"
            className="ml-2 px-1 font-mono text-white/70"
          >
            ×
          </button>
        </div>
        <div className="bg-[#0d1424] px-4 py-3 text-sm text-white/85">
          Four beds on the harbor, listed this week.
        </div>
      </div>
    ) : deck === "details" ? (
      <div className="w-full max-w-sm bg-[#0d1424]">
        <div className={`${railRow} w-full bg-[#0d1424]`}>
          <span className="flex-1">Details</span>
          <button
            type="button"
            data-testid="preview-details-hide"
            onClick={() => setDeck(null)}
            aria-label="Hide Details"
            className="ml-2 px-1 font-mono text-white/70"
          >
            ×
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
            </ul>
          ) : (
            "Beds 4 · Baths 3 · 2,410 sf"
          )}
        </div>
      </div>
    ) : deck === "pulse" ? (
      <div className="flex h-auto w-full max-w-sm flex-col bg-[#0d1424]">
        <div className={`${railRow} w-full bg-[#0d1424]`}>
          <span className="flex-1">Town pulse</span>
          <button
            type="button"
            data-testid="preview-pulse-hide"
            onClick={() => setDeck(null)}
            aria-label="Hide Town pulse"
            className="ml-2 px-1 font-mono text-white/70"
          >
            ×
          </button>
        </div>
        <ul className="space-y-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
          <li>Inventory 42</li>
          <li>Months supply 3.1 mo</li>
          <li>Avg DOM 28d</li>
          <li>Closed 21 · 12 mos</li>
          <li>Median $1.85M</li>
          <li>Delta +$40K</li>
          <li>Average $2.01M</li>
          <li>Sale to ask 98.2%</li>
          <li>Median tax $18,440</li>
        </ul>
      </div>
    ) : deck === "map" ? (
      <div className="flex h-64 w-full max-w-sm flex-col bg-[#0d1424]">
        <div className={`${railRow} w-full bg-[#0d1424]`}>
          <span className="flex-1">Map</span>
          <span className="rounded-md border border-white/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/85">
            Full screen
          </span>
          <button
            type="button"
            onClick={() => setDeck(null)}
            aria-label="Hide Map"
            className="ml-2 px-1 font-mono text-white/70"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-[#1a2744]" />
      </div>
    ) : null;

  const compsPill = compsOpen ? (
    <div className={`${railRowOpaque} w-fit max-w-full gap-2`}>
      <span className="underline decoration-white/35 underline-offset-4">
        Comps
      </span>
      <span className="flex items-center gap-1">
        <CountChip label="On market" count={6} />
        <CountChip label="Sold 12 in mos" count={21} />
      </span>
      <button
        type="button"
        data-testid="preview-comps-hide"
        onClick={() => setCompsOpen(false)}
        aria-label="Hide comps"
        className="ml-2 shrink-0 px-1.5 font-mono text-[18px] leading-none text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  ) : (
    <DemoControl
      label="Comps"
      glyph={<CompsGlyph />}
      showLabel={labelsMax && !deck}
      testId="preview-comps-open"
      onClick={toggleComps}
    />
  );

  const ifPill = ifOpen ? (
    <div className={`${railRowOpaque} w-fit max-w-full gap-2`}>
      <span className="underline decoration-white/35 underline-offset-4">
        What if
      </span>
      <span className="flex items-center gap-1">
        <CountChip label="Sale" count="$1.4M" />
        <CountChip label="Rent" count="$6.2K" />
      </span>
      <button
        type="button"
        data-testid="preview-if-hide"
        onClick={() => setIfOpen(false)}
        aria-label="Hide What if"
        className="ml-2 shrink-0 px-1.5 font-mono text-[18px] leading-none text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  ) : (
    <DemoControl
      label="What if"
      glyph={<WhatIfGlyph />}
      showLabel={labelsMax && !deck}
      testId="preview-if-open"
      onClick={toggleIf}
    />
  );

  return (
    <div className="relative min-h-[28rem]">
      <div className="absolute inset-y-0 right-0 flex w-[min(24rem,calc(100%-0.75rem))] flex-col items-end pr-3">
        <div className="flex shrink-0 flex-col items-end gap-4 pt-4">
          <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
          {deck ? null : (
            <button
              type="button"
              data-testid="preview-rail-minmax"
              onClick={() => setLabelsMax((current) => !current)}
              aria-pressed={labelsMax}
              aria-label={labelsMax ? "Show icons only" : "Show icon names"}
              title={labelsMax ? "Minimize to icons" : "Maximize labels"}
              className={railIcon}
            >
              <span className="relative">
                {labelsMax ? <MinimizeGlyph /> : <MaximizeGlyph />}
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col items-end justify-end gap-1 pb-1">
          {deck === "insight" ? null : (
            <DemoControl
              label="Insight"
              glyph={<InsightGlyph />}
              showLabel={labelsMax && !deck}
              testId="preview-insight-open"
              onClick={() => toggleDeck("insight")}
            />
          )}
          {deck === "details" ? null : (
            <DemoControl
              label="Details"
              glyph={<DetailsGlyph />}
              showLabel={labelsMax && !deck}
              testId="preview-details-open"
              onClick={() => toggleDeck("details")}
            />
          )}
          {compsPill}
        </div>
        {card ? (
          <div className="w-full self-end">{card}</div>
        ) : (
          <div
            className="listing-showcase-arrow flex h-14 w-14 items-center justify-center rounded-xl text-[34px] font-bold text-white"
            aria-hidden
          >
            →
          </div>
        )}
        <div className="flex flex-1 flex-col items-end justify-start gap-1 pt-1">
          {ifPill}
          {deck === "pulse" ? null : (
            <DemoControl
              label="Pulse"
              glyph={<PulseGlyph />}
              showLabel={labelsMax && !deck}
              testId="preview-pulse-open"
              onClick={() => toggleDeck("pulse")}
            />
          )}
          {deck === "map" ? null : (
            <DemoControl
              label="Map"
              glyph={<MapGlyph />}
              showLabel={labelsMax && !deck}
              onClick={() => toggleDeck("map")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MapChromeDemo() {
  const [pool, setPool] = useState<"active" | "uag" | "sold">("active");
  const previewBounds = useMemo(
    () => mapBoundZipsForListing("Westport", "06880"),
    [],
  );
  const previewListings = useMemo(
    () => [
      {
        key: "preview-harbor",
        address: "12 Harbor Rd",
        city: "Westport",
        price: 1_900_000,
        score: 80,
        isRental: false,
        sqft: 2410,
        latitude: 41.141,
        longitude: -73.358,
      },
    ],
    [],
  );
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
          <span className="px-1 font-mono text-[18px] leading-none text-white/70">
            ×
          </span>
        </div>
        <div className="relative min-h-0 w-full flex-1">
          <div className="absolute inset-0">
            <DealBoardMap
              listings={previewListings}
              subjectKey="preview-harbor"
              boundZips={previewBounds.boundZips}
              highlightZip={previewBounds.highlightZip}
              className="h-full w-full"
              heightClass="h-full"
              hideLocationOverlayButton
            />
          </div>
          <div className="absolute right-2 top-2 z-20 flex flex-col items-end gap-1">
            <span className="rounded-md border border-white/15 bg-[#0d1424] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/85">
              Full size
            </span>
            <div className="flex flex-col bg-[#0d1424]">
              {(
                [
                  { id: "active" as const, label: "For sale", count: 6 },
                  { id: "uag" as const, label: "Under Agreement", count: 2 },
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
          Status, street, and Offered at / Closed at sit on the same navy
          wash — strongest in the middle, transparent at the edges. Offered
          at / Closed at lives in the top-right over min/max on every
          screen. Status and the address stay on the left.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-slate">
              Phone
            </h3>
            <div className="listing-showcase-type relative mx-auto max-w-[390px] bg-[linear-gradient(135deg,#1a2744_0%,#0d1424_50%,#243656_100%)] px-4 py-10">
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
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-slate">
              Desktop
            </h3>
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
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl text-navy">
          Symbols around the right arrow
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Offered at sits in the top-right over min/max. Insight, Details,
          then Comps stack above the right arrow; What if, Pulse, and Map
          sit below. Glyphs use the same side-faded navy wash as status,
          address, and price. Decks are exclusive. Comps and What if expand
          in place.
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
          Map opens inset in the same slot. Full screen is an opt-in.
          Rail glyphs stay to its left. One Corridors control sits next to
          the Map label (admin). For sale, Under Agreement, and Closed
          stack under Full size.
        </p>
        <MapChromeDemo />
      </section>
    </div>
  );
}
