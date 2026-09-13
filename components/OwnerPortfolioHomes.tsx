"use client";

import Link from "next/link";
import { westportParcelHref } from "@/lib/listing-url";
import {
  sortOwnerPortfolioParcels,
  type OwnerPurchaseSortDir,
  type OwnerPurchaseSortKey,
} from "@/lib/owner-portfolio-sort";
import type { VisionOwnerPortfolioParcel } from "@/lib/vision-owner-keys";

function PurchaseSortLink({
  column,
  label,
  activeKey,
  dir,
  onSort,
}: {
  column: OwnerPurchaseSortKey;
  label: string;
  activeKey: OwnerPurchaseSortKey | null;
  dir: OwnerPurchaseSortDir;
  onSort: (column: OwnerPurchaseSortKey) => void;
}) {
  const active = activeKey === column;
  return (
    <a
      href={`#sort-purchases-${column}`}
      onClick={(event) => {
        event.preventDefault();
        onSort(column);
      }}
      className={`inline-flex items-center gap-1 no-underline ${
        active ? "text-navy" : "text-navy/70 hover:text-navy"
      }`}
      aria-label={`Sort purchases by ${label}${active ? `, ${dir}ending` : ""}`}
    >
      {active ? (
        <span aria-hidden className="w-2.5 shrink-0 text-[9px] tracking-normal">
          {dir === "asc" ? "↑" : "↓"}
        </span>
      ) : (
        <span className="w-2.5 shrink-0" aria-hidden />
      )}
      <span className="underline underline-offset-2 decoration-navy/35 hover:decoration-navy">
        {label}
      </span>
    </a>
  );
}

export function OwnerPortfolioHomes({
  parcels,
  purchaseTotalLabel,
  sortKey,
  sortDir,
  onSort,
}: {
  parcels: readonly VisionOwnerPortfolioParcel[];
  purchaseTotalLabel?: string | null;
  sortKey: OwnerPurchaseSortKey | null;
  sortDir: OwnerPurchaseSortDir;
  onSort: (column: OwnerPurchaseSortKey) => void;
}) {
  const rows = sortOwnerPortfolioParcels(parcels, sortKey, sortDir);

  return (
    <>
      <div className="mt-3 flex items-baseline justify-end gap-4 font-mono text-[10px] uppercase tracking-[0.14em]">
        <PurchaseSortLink
          column="date"
          label="Date"
          activeKey={sortKey}
          dir={sortDir}
          onSort={onSort}
        />
        <PurchaseSortLink
          column="amount"
          label="Amount"
          activeKey={sortKey}
          dir={sortDir}
          onSort={onSort}
        />
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {rows.map((parcel) => (
          <li
            key={`${parcel.town}:${parcel.visionPid}`}
            className="flex items-start justify-between gap-6"
          >
            <Link
              href={westportParcelHref(parcel.visionPid)}
              className="min-w-0 font-mono text-sm text-navy hover:underline"
            >
              {parcel.siteAddress}
            </Link>
            {parcel.lastPaidPriceLabel ? (
              <p className="flex shrink-0 items-baseline justify-end gap-3 text-right">
                {parcel.lastPaidSaleDate ? (
                  <span className="font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
                    {parcel.lastPaidSaleDate}
                  </span>
                ) : null}
                <span className="font-mono text-sm tabular-nums text-charcoal/90">
                  {parcel.lastPaidPriceLabel}
                </span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {purchaseTotalLabel ? (
        <p className="mt-3 flex items-baseline justify-between gap-6 border-t border-charcoal/[0.08] pt-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
            Purchases
          </span>
          <span className="font-mono text-sm tabular-nums text-navy">
            {purchaseTotalLabel}
          </span>
        </p>
      ) : null}
    </>
  );
}
