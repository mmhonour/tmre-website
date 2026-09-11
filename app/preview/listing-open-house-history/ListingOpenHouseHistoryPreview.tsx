"use client";

import { useState } from "react";
import { ListingOpenHouseHistory } from "@/components/listing/ListingOpenHouseHistory";
import type { ListingOpenHouse } from "@/lib/open-houses";

const FIXTURES: ListingOpenHouse[] = [
  {
    id: "oh-sat",
    listingKey: "KEY-CURRENT",
    listingId: "MLS-CURRENT",
    date: "2026-09-12",
    startDateTime: "2026-09-12T12:00:00",
    endDateTime: "2026-09-12T14:00:00",
    type: "O",
    comment: null,
    upcoming: true,
  },
  {
    id: "oh-last-year",
    listingKey: "KEY-PRIOR",
    listingId: "MLS-PRIOR",
    date: "2025-10-18",
    startDateTime: "2025-10-18T11:00:00",
    endDateTime: "2025-10-18T13:00:00",
    type: "O",
    comment: "Broker tour then public",
    upcoming: false,
  },
];

export function ListingOpenHouseHistoryPreview() {
  const [withHouses, setWithHouses] = useState(true);

  return (
    <div className="space-y-6">
      <button
        type="button"
        aria-pressed={withHouses}
        onClick={() => setWithHouses((value) => !value)}
        className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
          withHouses
            ? "border-gold/50 bg-gold/10 text-navy"
            : "border-charcoal/[0.08] bg-white text-navy"
        }`}
      >
        {withHouses ? "Has stored open houses" : "No open houses on file"}
      </button>

      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 space-y-5">
        <div>
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate mb-3">
            This listing
          </p>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-mono text-[10px] text-slate shrink-0 w-24 pt-0.5">
                Sep 2, 2026
              </span>
              <span className="text-charcoal">Price reduced</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[10px] text-slate shrink-0 w-24 pt-0.5">
                Aug 20, 2026
              </span>
              <span className="text-charcoal">Listed</span>
            </li>
          </ul>
        </div>
        {withHouses ? (
          <ListingOpenHouseHistory
            events={FIXTURES}
            currentMlsId="MLS-CURRENT"
            variant="modal"
          />
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
            Open houses section hidden when the API returns none.
          </p>
        )}
      </div>
    </div>
  );
}
