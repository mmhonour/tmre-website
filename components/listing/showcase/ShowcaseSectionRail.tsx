"use client";

import { useState } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
import type { ShowcaseDetailRow } from "@/components/listing/showcase/showcase-types";

type CardId = "insight" | "details" | "map";

/** Rectangular, borderless, full rail width, label left-aligned. */
const pillClass = (open: boolean) =>
  `flex w-full items-center justify-start px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:text-xs ${
    open
      ? "bg-navy text-white"
      : "bg-[#0d1424]/85 text-white/85 hover:bg-navy hover:text-white"
  }`;

/**
 * Rail of rectangular tiles floating over the right of the photo, inset from
 * the screen edge. Insight / Details / Map expand a card in flow directly
 * under their own tile, pushing the tiles below them down; clicking the tile
 * again collapses it. What if jumps to its section, Comps leaves for its route.
 * The next-photo arrow sits inside the stack so it lands on the vertical
 * middle of the photo.
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
  const toggle = (id: CardId) => setOpenCard((cur) => (cur === id ? null : id));

  const cardPill = (
    id: CardId,
    label: string,
    body: React.ReactNode,
    padded = true,
  ) => {
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
          <span aria-hidden className="ml-3 text-white/60">
            {open ? "−" : "+"}
          </span>
        </button>
        {open ? (
          <div
            className={`bg-[#0d1424]/95 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md ${
              padded ? "max-h-[60vh] overflow-y-auto overscroll-contain p-4" : ""
            }`}
          >
            {body}
          </div>
        ) : null}
      </div>
    );
  };

  /**
   * Top-anchored rather than centred so an open card only ever grows downward
   * — the offset puts the step arrow on the vertical middle when nothing is
   * open, and lets the map run to the foot of the photo when Map is.
   */
  return (
    <div className="absolute right-3 top-[calc(50%-9.5rem)] z-20 flex max-h-[calc(100dvh-9rem)] w-[min(24rem,calc(100vw-3rem))] flex-col items-end gap-2 overflow-y-auto sm:right-6">
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
        Comps
      </button>

      <ShowcaseStepArrow direction="next" label="Next photo" onClick={onNext} />

      <button
        type="button"
        onClick={() => scrollToShowcaseSection("if")}
        className={pillClass(false)}
      >
        What if
      </button>

      {cardPill(
        "map",
        "Map",
        <ShowcaseCompsMap
          mlsId={mlsId}
          subject={subject}
          townHint={townHint}
          // Runs from the Map tile down to roughly the foot of the photo.
          heightClass="h-[calc(50dvh-5rem)] min-h-[14rem]"
        />,
        /* padded */ false,
      )}
    </div>
  );
}
