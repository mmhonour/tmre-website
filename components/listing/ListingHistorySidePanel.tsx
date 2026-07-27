"use client";

import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { useListingHistoryDetailsSwap } from "@/components/listing/ListingHistoryDetailsSwapContext";
import ListingPanelElevateTriangle from "@/components/listing/ListingPanelElevateTriangle";

/**
 * Desktop right-column History shell under Details — same elevate control
 * pattern as Details↔remarks (link + triangle).
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
  const historySwap = useListingHistoryDetailsSwap();

  return (
    <div className={`${frameClass} flex flex-col`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gold">
          History
        </p>
        {historySwap ? (
          <button
            type="button"
            onClick={historySwap.toggle}
            className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] uppercase text-gold/85 transition-colors hover:text-gold"
            aria-expanded={historySwap.historyElevated}
            aria-label={
              historySwap.historyElevated
                ? "See details"
                : "See more history"
            }
          >
            <span className="underline decoration-gold/35 underline-offset-2">
              {historySwap.historyElevated
                ? "SEE DETAILS"
                : "see more history"}
            </span>
            <ListingPanelElevateTriangle
              pointing={historySwap.historyElevated ? "down" : "up"}
            />
          </button>
        ) : null}
      </div>
      <ListingHistoryPanel
        mlsId={mlsId}
        townHint={townHint}
        variant="side"
      />
    </div>
  );
}
