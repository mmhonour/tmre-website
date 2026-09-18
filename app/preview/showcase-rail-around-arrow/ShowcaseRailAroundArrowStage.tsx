"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ListingShowcasePriceBlock } from "@/components/listing/showcase/ListingShowcasePriceBlock";
import { ListingShowcaseTypeWash } from "@/components/listing/showcase/listing-showcase-wash";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
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

/**
 * Preview-only wash — a bit more opaque than production
 * `listingShowcaseWashClass` (0.5 / 0.85 → 0.68 / 0.94).
 */
const PREVIEW_GLYPH_WASH =
  "bg-[linear-gradient(90deg,rgb(13_20_36/0)_0%,rgb(13_20_36/0.68)_22%,rgb(13_20_36/0.94)_50%,rgb(13_20_36/0.68)_78%,rgb(13_20_36/0)_100%)]";

const glyphIcon = `relative inline-flex h-11 min-w-[2.75rem] items-center justify-center px-3 text-white/90 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] ${PREVIEW_GLYPH_WASH}`;

const glyphLabel = `relative flex w-fit items-center gap-2 px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white/90 shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] ${PREVIEW_GLYPH_WASH}`;

/** Same gap between every rail tile, including comps ↔ arrow ↔ What if. */
const RAIL_GAP = "gap-3";
/**
 * Half the 3.5rem arrow plus one RAIL_GAP (0.75rem) so the tiles sit off
 * the arrow by the same amount they sit off each other.
 */
const ARROW_CLEAR = "2.5rem";

/** Same chrome as `Navigation` on a phone — in-frame so `fixed` does not escape. */
function MobileHeaderFixture() {
  const [open, setOpen] = useState(false);
  return (
    <header
      className={`absolute inset-x-0 top-0 z-50 ${
        open ? "bg-navy border-b border-white/10" : "bg-transparent"
      }`}
    >
      <div className="px-6 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg shadow-lg shadow-gold/20 ring-1 ring-gold/40">
              <Image
                src="/timothy-tmre.png"
                alt="Timothy Marks"
                fill
                sizes="40px"
                className="object-cover grayscale"
              />
            </span>
            <span className="flex min-w-0 flex-col gap-0">
              <span className="font-serif text-xl leading-tight tracking-[0.15em] text-white">
                TMRE
              </span>
              <span className="font-serif text-[11px] leading-tight tracking-wide text-white/75">
                Timothy Marks
                <br />
                Real Estate
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            className="flex flex-col gap-1.5 p-2"
          >
            <span
              className={`block h-px w-6 bg-white transition-transform ${
                open ? "translate-y-2 rotate-45" : ""
              }`}
            />
            <span
              className={`block h-px w-6 bg-white transition-opacity ${
                open ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block h-px w-6 bg-white transition-transform ${
                open ? "-translate-y-2 -rotate-45" : ""
              }`}
            />
          </button>
        </div>
        {open ? (
          <nav className="mt-3 border-t border-white/10 bg-navy pb-4 pt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/80">
            <p>Latest</p>
            <p className="mt-2">Open Houses</p>
            <p className="mt-2">Find</p>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

/** Expanded Comps / What if — solid navy so the photo cannot read through. */
function ExpandedFigurePill({
  label,
  chips,
  onHide,
}: {
  label: string;
  chips: readonly { label: string; value: string }[];
  onHide: () => void;
}) {
  return (
    <div className="relative flex w-fit max-w-full items-center gap-2 bg-[#0d1424] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] sm:text-xs">
      <span className="underline decoration-white/35 underline-offset-4">
        {label}
      </span>
      <span className="flex items-center gap-1">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex shrink-0 items-center gap-1.5 bg-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65"
          >
            {chip.label}
            <span className="tabular-nums normal-case tracking-[0.08em] text-white">
              {chip.value}
            </span>
          </span>
        ))}
      </span>
      <button
        type="button"
        onClick={onHide}
        aria-label={`Hide ${label}`}
        className="ml-2 shrink-0 px-1 font-mono text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

const PULSE_ROWS: readonly { label: string; value: string }[] = [
  { label: "Inventory", value: "42" },
  { label: "Months supply", value: "3.1 mo" },
  { label: "Avg DOM", value: "28d" },
  { label: "Closed 12 mos", value: "21" },
  { label: "Median", value: "$1.85M" },
  { label: "Delta", value: "+$40K" },
  { label: "Average", value: "$2.01M" },
  { label: "Sale to ask", value: "98.2%" },
  { label: "Median tax", value: "$18,440" },
];

const DETAILS_ROWS: readonly { label: string; value: string }[] = [
  { label: "Beds", value: "4" },
  { label: "Baths", value: "3" },
  { label: "Living area", value: "2,410 sf" },
  { label: "Lot", value: "0.42 ac" },
  { label: "Assessed", value: "$1.12M" },
  { label: "Tax", value: "$18,440" },
  { label: "DOM", value: "12" },
  { label: "Schools", value: "Coleytown / Staples" },
];

/** Town pulse / Details — hug the rows; grow top and bottom, no scroll box. */
function FitDeckCard({
  title,
  rows,
  onHide,
}: {
  title: string;
  rows: readonly { label: string; value: string }[];
  onHide: () => void;
}) {
  return (
    <div className="flex h-auto w-full flex-col bg-[#0d1424]">
      <div
        className={`relative flex w-full items-center px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white ${PREVIEW_GLYPH_WASH}`}
      >
        <span>{title}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide ${title}`}
          className="ml-2 shrink-0 px-1.5 font-mono text-[18px] leading-none text-white/70 hover:text-white"
        >
          ×
        </button>
      </div>
      <ul className="space-y-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
        {rows.map((row) => (
          <li key={row.label} className="flex justify-between gap-4">
            <span className="text-white/45">{row.label}</span>
            <span className="tabular-nums text-white">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GlyphButton({
  label,
  glyph,
  showLabel,
  pressed,
  onClick,
}: {
  label: string;
  glyph: ReactNode;
  showLabel: boolean;
  pressed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={showLabel ? glyphLabel : glyphIcon}
    >
      <span className="relative">{glyph}</span>
      {showLabel ? <span className="relative">{label}</span> : null}
    </button>
  );
}

export function ShowcaseRailAroundArrowStage({
  variant,
  chrome = "fixture",
}: {
  variant: "desktop" | "mobile";
  /**
   * `fixture` — fake header inside a 390×844 frame (laptop looking at the
   * phone page). `site` — full viewport under the real `Navigation`.
   */
  chrome?: "fixture" | "site";
}) {
  const [labelsMax, setLabelsMax] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const mobile = variant === "mobile";
  const showLabel = labelsMax;
  const pad = mobile ? "pr-3" : "pr-6";
  const framed = mobile && chrome === "fixture";

  return (
    <div
      className={`listing-showcase-type relative overflow-hidden bg-[linear-gradient(135deg,#1a2744_0%,#0d1424_48%,#243656_100%)] ${
        framed ? "h-[844px] w-[390px]" : "min-h-[100dvh] w-full"
      }`}
    >
      <div
        className="listing-showcase-scrim-top pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div
        className="listing-showcase-scrim-bottom pointer-events-none absolute inset-0"
        aria-hidden
      />

      {framed ? <MobileHeaderFixture /> : null}

      {/*
        Status + address on the left. Phone raises the band (top-20) so
        status and price sit above Insight; price is flush to the right
        edge and top-aligned with status.
      */}
      <div
        className={`absolute left-4 z-20 ${
          mobile
            ? "top-20 right-0 flex items-start justify-between gap-3"
            : "top-24 max-w-xl sm:left-8 lg:left-12"
        }`}
      >
        <div className={mobile ? "min-w-0 flex-1" : undefined}>
          <ListingShowcaseTypeWash className="w-fit min-w-[8rem] px-8 py-1.5 text-center">
            <span className="relative font-mono text-[10px] uppercase tracking-[0.25em] text-gold">
              Active
            </span>
          </ListingShowcaseTypeWash>
          <ListingShowcaseTypeWash className="mt-2 w-fit max-w-full px-5 py-2">
            <p
              className={`relative font-serif leading-tight text-white ${
                mobile ? "text-2xl" : "text-4xl lg:text-5xl"
              }`}
            >
              12 Harbor Rd
            </p>
            <p className="relative mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">
              Westport, CT
            </p>
          </ListingShowcaseTypeWash>
        </div>
        {mobile ? (
          <div className="shrink-0 self-start">
            <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
          </div>
        ) : null}
      </div>

      {mobile ? null : (
        <div className={`absolute top-24 right-0 z-30 ${pad}`}>
          <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
        </div>
      )}

      {/*
        Arrow stays on the vertical midpoint. Tiles above grow up from it,
        tiles below grow down. One gap everywhere — comps-to-arrow equals
        arrow-to-What if equals maximize-to-Insight, and so on.
      */}
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-1/2 z-20 flex flex-col items-end justify-end ${RAIL_GAP} ${pad}`}
        style={{ paddingBottom: ARROW_CLEAR }}
      >
        {mobile ? null : (
          <button
            type="button"
            aria-pressed={labelsMax}
            aria-label={labelsMax ? "Show icons only" : "Show icon names"}
            title={labelsMax ? "Minimize to icons" : "Maximize labels"}
            onClick={() => setLabelsMax((open) => !open)}
            className={glyphIcon}
          >
            <span className="relative">
              {labelsMax ? <MinimizeGlyph /> : <MaximizeGlyph />}
            </span>
          </button>
        )}
        <GlyphButton
          label="Insight"
          glyph={<InsightGlyph />}
          showLabel={showLabel}
          pressed={active === "insight"}
          onClick={() =>
            setActive((id) => (id === "insight" ? null : "insight"))
          }
        />
        {active === "details" ? null : (
          <GlyphButton
            label="Details"
            glyph={<DetailsGlyph />}
            showLabel={showLabel}
            pressed={false}
            onClick={() => setActive("details")}
          />
        )}
        {active === "comps" ? (
          <ExpandedFigurePill
            label="Comps"
            chips={[
              { label: "On market", value: "6" },
              { label: "Sold 12 in mos", value: "21" },
            ]}
            onHide={() => setActive(null)}
          />
        ) : (
          <GlyphButton
            label="Comps"
            glyph={<CompsGlyph />}
            showLabel={showLabel}
            pressed={false}
            onClick={() => setActive("comps")}
          />
        )}
      </div>
      <div
        className={`pointer-events-auto absolute inset-x-0 top-1/2 z-20 flex flex-col items-end justify-start ${RAIL_GAP} ${pad}`}
        style={{ paddingTop: ARROW_CLEAR }}
      >
        {active === "what-if" ? (
          <ExpandedFigurePill
            label="What if"
            chips={[
              { label: "Sale", value: "$1.4M" },
              { label: "Rent", value: "$6.2K" },
            ]}
            onHide={() => setActive(null)}
          />
        ) : (
          <GlyphButton
            label="What if"
            glyph={<WhatIfGlyph />}
            showLabel={showLabel}
            pressed={false}
            onClick={() => setActive("what-if")}
          />
        )}
        {active === "pulse" ? null : (
          <GlyphButton
            label="Town pulse"
            glyph={<PulseGlyph />}
            showLabel={showLabel}
            pressed={false}
            onClick={() => setActive("pulse")}
          />
        )}
        <GlyphButton
          label="Map"
          glyph={<MapGlyph />}
          showLabel={showLabel}
          pressed={active === "map"}
          onClick={() => setActive((id) => (id === "map" ? null : "map"))}
        />
        {mobile ? (
          <button
            type="button"
            aria-pressed={labelsMax}
            aria-label={labelsMax ? "Show icons only" : "Show icon names"}
            title={labelsMax ? "Minimize to icons" : "Maximize labels"}
            onClick={() => setLabelsMax((open) => !open)}
            className={glyphIcon}
          >
            <span className="relative">
              {labelsMax ? <MinimizeGlyph /> : <MaximizeGlyph />}
            </span>
          </button>
        ) : null}
      </div>

      {active === "pulse" || active === "details" ? (
        <div
          className={`pointer-events-auto absolute z-40 -translate-y-1/2 ${
            mobile
              ? "left-0 right-14 top-1/2"
              : "right-24 top-1/2 w-[min(24rem,calc(100%-8rem))]"
          }`}
        >
          <FitDeckCard
            title={active === "details" ? "Details" : "Town pulse"}
            rows={active === "details" ? DETAILS_ROWS : PULSE_ROWS}
            onHide={() => setActive(null)}
          />
        </div>
      ) : null}

      <ShowcaseStepArrow
        direction="prev"
        label="Previous photo"
        onClick={() => undefined}
        className={`absolute left-3 top-1/2 z-20 -translate-y-1/2 ${
          mobile ? "" : "sm:left-6"
        }`}
      />
      <ShowcaseStepArrow
        direction="next"
        label="Next photo"
        onClick={() => undefined}
        className={`absolute top-1/2 z-20 -translate-y-1/2 ${
          mobile ? "right-3" : "right-6"
        }`}
      />
    </div>
  );
}
