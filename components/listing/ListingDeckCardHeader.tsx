"use client";

import {
  useListingDesktopDeck,
  type ListingDesktopDeckCardId,
} from "@/components/listing/ListingDesktopDeckContext";

/**
 * Shared header for the desktop Remarks / Details / History / Admin deck.
 * Entire header toggles expand/minimize; More/Less hyperlink mirrors state.
 */
export default function ListingDeckCardHeader({
  cardId,
  title,
  titleClassName = "font-mono text-[9px] tracking-[0.18em] uppercase text-gold",
}: {
  cardId: ListingDesktopDeckCardId;
  title: string;
  titleClassName?: string;
}) {
  const deck = useListingDesktopDeck();
  if (!deck) {
    return <p className={titleClassName}>{title}</p>;
  }

  const expanded = deck.isExpanded(cardId);

  return (
    <button
      type="button"
      onClick={() => deck.toggleCard(cardId)}
      className="mb-0 flex w-full items-center justify-between gap-2 text-left transition-colors hover:opacity-95"
      aria-expanded={expanded}
      aria-controls={`listing-deck-body-${cardId}`}
      aria-label={expanded ? `Show less of ${title}` : `Show more of ${title}`}
    >
      <span className={titleClassName}>{title}</span>
      <span className="shrink-0 font-mono text-[9px] tracking-[0.14em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2">
        {expanded ? "Less" : "More"}
      </span>
    </button>
  );
}
