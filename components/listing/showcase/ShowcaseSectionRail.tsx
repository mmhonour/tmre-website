"use client";

import {
  scrollToShowcaseSection,
  type ShowcaseSection,
} from "@/components/listing/showcase/showcase-sections";

const RAIL: { section: ShowcaseSection; label: string }[] = [
  { section: "insight", label: "Insight" },
  { section: "details", label: "Details" },
  { section: "if", label: "What if" },
  { section: "map", label: "Map" },
];

/**
 * Gold bubbles floating over the right of the photo, flat on the right so they
 * read as running off the edge. Same treatment on mobile and desktop; each one
 * jumps to its section in the panel below rather than leaving the page.
 *
 * Sits below the vertical centre so it clears the next-photo arrow.
 */
export default function ShowcaseSectionRail() {
  return (
    <div
      className="absolute right-0 top-[calc(50%+2.75rem)] z-20 flex flex-col items-end gap-1.5"
      role="toolbar"
      aria-label="Jump to listing details"
    >
      {RAIL.map((item) => (
        <button
          key={item.section}
          type="button"
          onClick={() => scrollToShowcaseSection(item.section)}
          className="inline-flex w-fit items-center justify-end rounded-l-full rounded-r-none border border-r-0 border-gold/45 bg-[#121c2e]/95 py-1.5 pl-3.5 pr-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-gold/90 shadow-[-4px_2px_12px_-4px_rgba(0,0,0,0.55)] transition-colors hover:border-gold hover:bg-navy hover:text-gold sm:text-[10px]"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
