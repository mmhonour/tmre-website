"use client";

import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import ListingDeckCardHeader from "@/components/listing/ListingDeckCardHeader";
import { useListingDesktopDeck } from "@/components/listing/ListingDesktopDeckContext";

/**
 * Desktop right-column History card in the Remarks / Details / History / Admin
 * deck — header always peeks; body only when this card is selected.
 */
export default function ListingHistorySidePanel({
  mlsId,
  townHint,
  frameClass,
}: {
  mlsId: string;
  townHint?: string | null;
  frameClass: string;
}) {
  const deck = useListingDesktopDeck();
  const expanded = deck ? deck.isExpanded("history") : true;

  return (
    <div className={`${frameClass} flex flex-col`}>
      <ListingDeckCardHeader cardId="history" title="History" />
      <div
        id="listing-deck-body-history"
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: expanded ? 2400 : 0 }}
        aria-hidden={!expanded}
      >
        <div className={expanded ? "mt-2" : "invisible h-0"}>
          <ListingHistoryPanel
            mlsId={mlsId}
            townHint={townHint}
            variant="side"
          />
        </div>
      </div>
    </div>
  );
}
