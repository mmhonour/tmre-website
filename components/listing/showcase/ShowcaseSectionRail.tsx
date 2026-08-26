"use client";

import Link from "next/link";
import { useState } from "react";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
import type { ShowcaseDetailRow } from "@/components/listing/showcase/showcase-types";

type CardId = "insight" | "details" | "map";

const pillClass = (open: boolean) =>
  `inline-flex w-44 shrink-0 items-center justify-end rounded-l-full rounded-r-none border border-r-0 py-2.5 pl-5 pr-4 font-mono text-[11px] uppercase tracking-[0.18em] shadow-[-6px_3px_16px_-6px_rgba(0,0,0,0.65)] transition-colors sm:w-52 sm:text-xs ${
    open
      ? "border-white bg-navy text-white"
      : "border-white/60 bg-[#0d1424]/85 text-white/85 hover:border-white hover:bg-navy hover:text-white"
  }`;

/** Opens under its own pill, right-aligned, without shifting the rail. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-3rem))] rounded-xl border border-white/25 bg-[#0d1424]/95 p-4 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md">
      {children}
    </div>
  );
}

/**
 * Gold-free bubble rail floating over the right of the photo, inset from the
 * screen edge with the right end left open. Insight / Details / Map expand a
 * card in place; What if jumps to its section and Comps leaves for its route.
 * The next-photo arrow sits inside the stack so it lands on the vertical
 * middle of the photo alongside the pills.
 */
export default function ShowcaseSectionRail({
  insight,
  detailRows,
  latitude,
  longitude,
  addressQuery,
  compsHref,
  onNext,
}: {
  insight: string | null;
  detailRows: ShowcaseDetailRow[];
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  compsHref: string;
  onNext: () => void;
}) {
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  const toggle = (id: CardId) => setOpenCard((cur) => (cur === id ? null : id));

  const cardPill = (id: CardId, label: string, body: React.ReactNode) => (
    <div className={`relative flex flex-col items-end ${openCard === id ? "z-30" : ""}`}>
      <button
        type="button"
        onClick={() => toggle(id)}
        aria-expanded={openCard === id}
        className={pillClass(openCard === id)}
      >
        {label}
      </button>
      {openCard === id ? <Card>{body}</Card> : null}
    </div>
  );

  return (
    <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-end gap-2 sm:right-6">
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

      <Link href={compsHref} className={pillClass(false)}>
        Comps
      </Link>

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
        <div className="h-56 w-full overflow-hidden rounded-lg">
          <ListingLocationMap
            latitude={latitude}
            longitude={longitude}
            addressQuery={addressQuery}
            variant="hero"
            hideLabel
          />
        </div>,
      )}
    </div>
  );
}
