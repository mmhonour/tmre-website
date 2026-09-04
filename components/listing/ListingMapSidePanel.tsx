"use client";

import type { ReactNode } from "react";
import ListingDeckCardHeader from "@/components/listing/ListingDeckCardHeader";

/**
 * Desktop right-column Map card. Always paints the leftover height under
 * Remarks / Details / History so the map fills the rest of the viewport
 * rather than a fixed 16rem box.
 */
export default function ListingMapSidePanel({
  frameClass,
  children,
}: {
  frameClass: string;
  children: ReactNode;
}) {
  return (
    <div className={`${frameClass} flex h-full min-h-0 flex-col`}>
      <ListingDeckCardHeader cardId="map" title="Map" />
      <div
        id="listing-deck-body-map"
        className="mt-2 flex min-h-0 flex-1 flex-col"
      >
        <div className="h-full min-h-[12rem] flex-1">{children}</div>
      </div>
    </div>
  );
}
