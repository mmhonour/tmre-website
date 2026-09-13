"use client";

import { useState } from "react";
import { OwnerPortfolioHomes } from "@/components/OwnerPortfolioHomes";
import {
  nextOwnerPurchaseSort,
  type OwnerPurchaseSortDir,
  type OwnerPurchaseSortKey,
} from "@/lib/owner-portfolio-sort";
import type { VisionOwnerPortfolio } from "@/lib/vision-owner-keys";

export function OwnerPortfoliosList({
  portfolios,
  homesNote,
}: {
  portfolios: readonly VisionOwnerPortfolio[];
  /** Extra homes-count copy, e.g. "on this street". */
  homesNote?: string;
}) {
  const [sortKey, setSortKey] = useState<OwnerPurchaseSortKey | null>(null);
  const [sortDir, setSortDir] = useState<OwnerPurchaseSortDir>("desc");

  const onSort = (column: OwnerPurchaseSortKey) => {
    const next = nextOwnerPurchaseSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  return (
    <ol className="space-y-5">
      {portfolios.map((row) => (
        <li
          key={row.clusterId}
          className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl text-navy">{row.displayName}</h2>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
              {row.parcelCount}{" "}
              {row.parcelCount === 1 ? "home" : "homes"}
              {homesNote ? ` ${homesNote}` : null}
              {row.relationship === "landlord"
                ? " · landlord"
                : " · same mailing"}
            </p>
          </div>
          {row.mailingLabel ? (
            <p className="mt-1 font-mono text-[12px] text-slate/70">
              {row.mailingLabel}
            </p>
          ) : null}
          <OwnerPortfolioHomes
            parcels={row.parcels}
            purchaseTotalLabel={row.lastPaidTotalLabel}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
        </li>
      ))}
    </ol>
  );
}
