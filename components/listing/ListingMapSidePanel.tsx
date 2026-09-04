"use client";

import type { ReactNode } from "react";
import ListingDeckCardHeader from "@/components/listing/ListingDeckCardHeader";
import { useListingDesktopDeck } from "@/components/listing/ListingDesktopDeckContext";

/**
 * Desktop right-column Map card in the Remarks / Details / History / Map deck —
 * header always peeks under History; body only when this card is selected.
 */
export default function ListingMapSidePanel({
  frameClass,
  children,
}: {
  frameClass: string;
  children: ReactNode;
}) {
  const deck = useListingDesktopDeck();
  const expanded = deck ? deck.isExpanded("map") : true;

  return (
    <div className={`${frameClass} flex flex-col`}>
      <ListingDeckCardHeader cardId="map" title="Map" />
      <div
        id="listing-deck-body-map"
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: expanded ? 2400 : 0 }}
        aria-hidden={!expanded}
      >
        <div className={expanded ? "mt-2" : "invisible h-0"}>{children}</div>
      </div>
    </div>
  );
}
