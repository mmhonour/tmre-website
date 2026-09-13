"use client";

import { Fragment } from "react";
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
      className={`inline-flex items-center justify-end gap-1 no-underline ${
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
    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_max-content_max-content] items-baseline gap-x-6 gap-y-1.5">
      <div aria-hidden />
      <div className="justify-self-end font-mono text-[10px] uppercase tracking-[0.14em]">
        <PurchaseSortLink
          column="date"
          label="Date"
          activeKey={sortKey}
          dir={sortDir}
          onSort={onSort}
        />
      </div>
      <div className="justify-self-end font-mono text-[10px] uppercase tracking-[0.14em]">
        <PurchaseSortLink
          column="amount"
          label="Amount"
          activeKey={sortKey}
          dir={sortDir}
          onSort={onSort}
        />
      </div>
      {rows.map((parcel) => (
        <Fragment key={`${parcel.town}:${parcel.visionPid}`}>
          <Link
            href={westportParcelHref(parcel.visionPid)}
            className="min-w-0 text-left font-mono text-sm text-navy hover:underline"
          >
            {parcel.siteAddress}
          </Link>
          <p className="justify-self-end whitespace-nowrap text-right font-mono text-[11px] tabular-nums tracking-[0.04em] text-charcoal/55">
            {parcel.lastPaidSaleDate ?? ""}
          </p>
          <p className="justify-self-end whitespace-nowrap text-right font-mono text-sm tabular-nums text-charcoal/90">
            {parcel.lastPaidPriceLabel ?? ""}
          </p>
        </Fragment>
      ))}
      {purchaseTotalLabel ? (
        <>
          <div
            className="col-span-3 mt-1.5 border-t border-charcoal/[0.08]"
            aria-hidden
          />
          <p className="pt-2 font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
            Purchases
          </p>
          <p className="pt-2" />
          <p className="justify-self-end pt-2 text-right font-mono text-sm tabular-nums text-navy">
            {purchaseTotalLabel}
          </p>
        </>
      ) : null}
    </div>
  );
}
