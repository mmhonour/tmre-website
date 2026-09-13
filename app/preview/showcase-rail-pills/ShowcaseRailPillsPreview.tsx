"use client";

import { useState } from "react";
import { ListingShowcasePriceBlock } from "@/components/listing/showcase/ListingShowcasePriceBlock";
import { ListingShowcaseTypeWash } from "@/components/listing/showcase/listing-showcase-wash";
import {
  CompsGlyph,
  DetailsGlyph,
  InsightGlyph,
  MapGlyph,
  PulseGlyph,
  SHOWCASE_RAIL_GLYPH_PROPOSAL,
  WhatIfGlyph,
} from "@/components/listing/showcase/showcase-rail-glyphs";

const railRow =
  "flex w-fit items-center justify-start bg-[#0d1424]/85 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)]";

const railIcon =
  "inline-flex h-11 w-11 items-center justify-center bg-[#0d1424]/85 text-white/85 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)]";

const railIconOn =
  "inline-flex h-11 w-11 items-center justify-center bg-navy text-white shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)]";

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

/** Default: symbols only. First tap reveals figures; « hides them. */
function SymbolRailDemo() {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"summary" | "full">("summary");

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
          «
        </button>
      </div>
    ) : (
      <button
        type="button"
        data-testid="preview-comps-open"
        onClick={() => setRevealed("comps")}
        aria-label="Comps"
        title="Comps"
        className={railIcon}
      >
        <CompsGlyph />
      </button>
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
          «
        </button>
      </div>
    ) : (
      <button
        type="button"
        data-testid="preview-if-open"
        onClick={() => setRevealed("if")}
        aria-label="What if"
        title="What if"
        className={railIcon}
      >
        <WhatIfGlyph />
      </button>
    );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-start gap-1">
        <div className="flex flex-col items-end gap-1">
          <span className={railIcon} title="Insight">
            <InsightGlyph />
          </span>
          <div className="flex items-center gap-1">
            {compsBtn}
            {ifBtn}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            data-testid="preview-details-open"
            onClick={() => setDetailsOpen((on) => !on)}
            aria-pressed={detailsOpen}
            title="Details"
            className={detailsOpen ? railIconOn : railIcon}
          >
            <DetailsGlyph />
          </button>
          <span className={railIcon} title="Map">
            <MapGlyph />
          </span>
          <span className={railIcon} title="Town pulse">
            <PulseGlyph />
          </span>
        </div>
      </div>

      {detailsOpen ? (
        <div className="mt-1 w-full max-w-sm bg-[#0d1424]/85">
          <div className="flex gap-0 border-b border-white/10 px-3">
            {(["summary", "full"] as const).map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`preview-details-tab-${id}`}
                onClick={() => setDetailsTab(id)}
                className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ${
                  detailsTab === id
                    ? "border-b-2 border-gold text-white"
                    : "border-b-2 border-transparent text-white/45"
                }`}
              >
                {id === "summary" ? "Summary" : "Full"}
              </button>
            ))}
          </div>
          <div className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
            {detailsTab === "summary"
              ? "Beds 4 · Baths 3 · 2,410 sf"
              : "Full details card — schools, taxes, rooms"}
          </div>
        </div>
      ) : null}
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
          Symbols first — Details tabs
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate">
          Page load is icons only. Insight sits above Comps; Comps sits left
          of What if. Details, Map, and Town pulse stack on the right. One
          Details control opens Summary / Full tabs.
        </p>
        <div className="bg-[linear-gradient(135deg,#1a2744_0%,#0d1424_50%,#243656_100%)] px-4 py-8">
          <SymbolRailDemo />
        </div>
      </section>
    </div>
  );
}
