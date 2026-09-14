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
}: {
  variant: "desktop" | "mobile";
}) {
  const [labelsMax, setLabelsMax] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const mobile = variant === "mobile";
  const showLabel = labelsMax;
  const pad = mobile ? "pr-3" : "pr-6";

  return (
    <div
      className={`listing-showcase-type relative overflow-hidden bg-[linear-gradient(135deg,#1a2744_0%,#0d1424_48%,#243656_100%)] ${
        mobile ? "h-[844px] w-[390px]" : "min-h-[100dvh] w-full"
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

      {mobile ? <MobileHeaderFixture /> : null}

      {/*
        Status + address on the left. Phone uses the same top band as the
        live listing (pt-24) so it clears the in-frame header.
      */}
      <div
        className={`absolute left-4 z-20 ${
          mobile ? "top-24 max-w-[11.5rem]" : "top-24 max-w-xl sm:left-8 lg:left-12"
        }`}
      >
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

      {/* Price right-aligned to the screen, top-aligned with status. */}
      <div
        className={`absolute z-30 ${pad} ${
          mobile ? "top-24 right-0" : "top-24 right-0"
        }`}
      >
        <ListingShowcasePriceBlock label="Offered at" amount="$1.90M" />
      </div>

      {/*
        Arrow stays on the vertical midpoint. Tiles above grow up from it,
        tiles below grow down. One gap everywhere — comps-to-arrow equals
        arrow-to-What if equals maximize-to-Insight, and so on.
      */}
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-1/2 z-20 flex flex-col items-end justify-end ${RAIL_GAP} ${pad}`}
        style={{ paddingBottom: ARROW_CLEAR }}
      >
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
        <GlyphButton
          label="Insight"
          glyph={<InsightGlyph />}
          showLabel={showLabel}
          pressed={active === "insight"}
          onClick={() =>
            setActive((id) => (id === "insight" ? null : "insight"))
          }
        />
        <GlyphButton
          label="Details"
          glyph={<DetailsGlyph />}
          showLabel={showLabel}
          pressed={active === "details"}
          onClick={() =>
            setActive((id) => (id === "details" ? null : "details"))
          }
        />
        <GlyphButton
          label="Comps"
          glyph={<CompsGlyph />}
          showLabel={showLabel}
          pressed={active === "comps"}
          onClick={() => setActive((id) => (id === "comps" ? null : "comps"))}
        />
      </div>
      <div
        className={`pointer-events-auto absolute inset-x-0 top-1/2 z-20 flex flex-col items-end justify-start ${RAIL_GAP} ${pad}`}
        style={{ paddingTop: ARROW_CLEAR }}
      >
        <GlyphButton
          label="What if"
          glyph={<WhatIfGlyph />}
          showLabel={showLabel}
          pressed={active === "what-if"}
          onClick={() =>
            setActive((id) => (id === "what-if" ? null : "what-if"))
          }
        />
        <GlyphButton
          label="Town pulse"
          glyph={<PulseGlyph />}
          showLabel={showLabel}
          pressed={active === "pulse"}
          onClick={() => setActive((id) => (id === "pulse" ? null : "pulse"))}
        />
        <GlyphButton
          label="Map"
          glyph={<MapGlyph />}
          showLabel={showLabel}
          pressed={active === "map"}
          onClick={() => setActive((id) => (id === "map" ? null : "map"))}
        />
      </div>

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
        className={`absolute top-1/2 z-30 -translate-y-1/2 ${
          mobile ? "right-3" : "right-6"
        }`}
      />
    </div>
  );
}
