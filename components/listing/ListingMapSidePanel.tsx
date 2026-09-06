"use client";

import type { ReactNode } from "react";
import ListingDeckCardHeader from "@/components/listing/ListingDeckCardHeader";

/**
 * Desktop right-column Map card. Minimized is header-only. Selected, it
 * overlays the other deck cards so only the map body is visible.
 */
export default function ListingMapSidePanel({
  frameClass,
  children,
  covering = false,
  onToggleCover,
}: {
  frameClass: string;
  children: ReactNode;
  covering?: boolean;
  onToggleCover?: () => void;
}) {
  return (
    <div
      className={`${frameClass} flex h-full min-h-0 flex-col ${
        covering
          ? "bg-[#0d1424] shadow-[0_18px_48px_-16px_rgba(0,0,0,0.85)]"
          : ""
      }`}
    >
      <ListingDeckCardHeader
        cardId="map"
        title="Map"
        expanded={covering}
        onToggle={onToggleCover}
      />
      <div
        id="listing-deck-body-map"
        className={
          covering
            ? "mt-2 flex min-h-0 flex-1 flex-col"
            : "hidden"
        }
        aria-hidden={!covering}
      >
        <div className="h-full min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
