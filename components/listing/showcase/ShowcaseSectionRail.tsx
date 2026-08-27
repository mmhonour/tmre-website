"use client";

import { useState } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
import type { ShowcaseDetailRow } from "@/components/listing/showcase/showcase-types";

type CardId = "insight" | "details";

const RAIL_WIDTH = "w-[min(24rem,calc(100vw-3rem))]";

/** Rectangular, borderless, flush-stacked, label left-aligned. */
const pillClass = (open: boolean) =>
  `flex w-full items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    open
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

/**
 * Rail of flush rectangular tiles over the right of the photo. Insight and
 * Details expand in flow beneath their own tile; Map takes over the whole
 * right column instead, since a map short enough to sit in the stack ran off
 * the bottom of the frame. What if and Comps jump to their sections below.
 */
export default function ShowcaseSectionRail({
  mlsId,
  insight,
  detailRows,
  subject,
  townHint,
  onNext,
}: {
  mlsId: string;
  insight: string | null;
  detailRows: ShowcaseDetailRow[];
  subject: DealBoardMapListing | null;
  townHint?: string | null;
  onNext: () => void;
}) {
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const toggle = (id: CardId) =>
    setOpenCard((cur) => (cur === id ? null : id));

  const cardPill = (id: CardId, label: string, body: React.ReactNode) => {
    const open = openCard === id;
    return (
      <div className="w-full">
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

  if (mapOpen) {
    return (
      <div
        className={`absolute inset-y-0 right-0 z-30 flex flex-col ${
          mapExpanded ? "w-[min(50vw,44rem)] max-lg:w-full" : RAIL_WIDTH
        }`}
      >
        <button
          type="button"
          onClick={() => setMapOpen(false)}
          aria-expanded
          className={pillClass(true)}
        >
          <span className="flex-1">Map</span>
          <Chevron open />
        </button>
        <div className="min-h-0 flex-1">
          <ShowcaseCompsMap
            mlsId={mlsId}
            subject={subject}
            townHint={townHint}
            expanded={mapExpanded}
            onToggleExpanded={() => setMapExpanded((on) => !on)}
          />
        </div>
      </div>
    );
  }

  /**
   * Top-anchored rather than centred so an open card only ever grows downward;
   * the offset puts the step arrow on the vertical middle when nothing is open.
   */
  return (
    <div
      className={`absolute right-0 top-[calc(50%-9.5rem)] z-20 flex max-h-[calc(100dvh-9rem)] flex-col items-end overflow-y-auto ${RAIL_WIDTH}`}
    >
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

      <button
        type="button"
        onClick={() => scrollToShowcaseSection("comps")}
        className={pillClass(false)}
      >
        <span className="flex-1">Comps</span>
      </button>

      <ShowcaseStepArrow direction="next" label="Next photo" onClick={onNext} />

      <button
        type="button"
        onClick={() => scrollToShowcaseSection("if")}
        className={pillClass(false)}
      >
        <span className="flex-1">What if</span>
      </button>

      <button
        type="button"
        onClick={() => setMapOpen(true)}
        aria-expanded={false}
        className={pillClass(false)}
      >
        <span className="flex-1">Map</span>
        <Chevron open={false} />
      </button>
    </div>
  );
}
