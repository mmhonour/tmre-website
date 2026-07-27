"use client";

import Link from "next/link";
import { fmtMoney } from "@/lib/listing-history";
import { fmtSqft, type ComparableListing } from "@/lib/listing-comparables-shared";
import type { IfCompRow } from "@/lib/listing-if-estimates";
import { listingDetailHref } from "@/lib/listing-url";

export type CriteriaMatchPreviewRow = {
  key: string;
  address: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  /** Already-formatted close or list amount (e.g. "$1.25M", "$4,500/mo"). */
  priceLabel: string;
  href?: string | null;
  tag?: string | null;
};

function bedBathLabel(beds: number | null, baths: number | null): string {
  const bed = beds != null ? `${beds}bd` : "—bd";
  const bath = baths != null ? `${baths}ba` : "—ba";
  return `${bed}/${bath}`;
}

function formatCompPrice(
  amount: number | null,
  isRental: boolean,
): string {
  if (amount == null || !(amount > 0)) return "—";
  return `${fmtMoney(amount)}${isRental ? "/mo" : ""}`;
}

/** Closed comps prefer closePrice; actives use list price. */
export function criteriaPreviewRowFromComparable(
  comp: ComparableListing,
  opts: {
    closed: boolean;
    isRental: boolean;
    tag?: string | null;
    townHint?: string | null;
  },
): CriteriaMatchPreviewRow {
  const amount = opts.closed
    ? comp.closePrice != null && comp.closePrice > 0
      ? comp.closePrice
      : comp.price
    : comp.price;
  const id = comp.listingKey?.trim() || comp.mlsId;
  return {
    key: id,
    address: comp.address?.trim() || "Address unavailable",
    beds: comp.beds,
    baths: comp.baths,
    sqft: comp.sqft,
    priceLabel: formatCompPrice(amount, opts.isRental),
    href: id
      ? listingDetailHref(id, comp.address, opts.townHint ?? comp.city)
      : null,
    tag: opts.tag ?? null,
  };
}

export function criteriaPreviewRowFromIfComp(
  comp: IfCompRow,
  opts: {
    isRental: boolean;
    tag?: string | null;
    townHint?: string | null;
  },
): CriteriaMatchPreviewRow {
  const id = comp.listingKey?.trim() || comp.mlsId;
  return {
    key: `${opts.isRental ? "rent" : "sale"}-${id}`,
    address: comp.address?.trim() || "Address unavailable",
    beds: comp.beds,
    baths: comp.baths,
    sqft: comp.sqft,
    priceLabel: formatCompPrice(comp.price, opts.isRental),
    href: id
      ? listingDetailHref(id, comp.address, opts.townHint ?? comp.city)
      : null,
    tag: opts.tag ?? null,
  };
}

/**
 * Compact match list under Criteria (desktop side panel + mobile drawer).
 * Shown when criteria leave baseline; cleared on reset.
 */
export default function CriteriaMatchPreviewList({
  pageLabel,
  rows,
  visible,
  isModal = false,
}: {
  /** Sold | RENTED | UAG | What If */
  pageLabel: string;
  rows: CriteriaMatchPreviewRow[];
  visible: boolean;
  isModal?: boolean;
}) {
  if (!visible || rows.length === 0) return null;

  const noteClass = isModal
    ? "font-mono text-[11px] leading-snug tracking-[0.1em] uppercase text-slate/75"
    : "font-mono text-[11px] leading-snug tracking-[0.1em] uppercase text-white/55";
  const pageName = pageLabel.trim().toUpperCase();
  const rowClass = isModal
    ? "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-snug text-charcoal/85 normal-case tracking-normal"
    : "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-snug text-white/80 normal-case tracking-normal";
  const metaClass = isModal ? "text-slate/70 tabular-nums" : "text-white/50 tabular-nums";
  const tagClass = isModal
    ? "font-mono text-[8px] tracking-[0.12em] uppercase text-slate/55"
    : "font-mono text-[8px] tracking-[0.12em] uppercase text-white/35";
  const linkClass = isModal
    ? "min-w-0 truncate text-navy hover:underline"
    : "min-w-0 truncate text-white/90 hover:text-gold hover:underline";

  return (
    <div
      className={
        isModal
          ? "mt-3 border-t border-charcoal/[0.08] pt-3 text-left"
          : "mt-3 border-t border-white/10 pt-3 text-left"
      }
    >
      <p className={noteClass}>
        More detail can be found on the {pageName} page. All results expanded
        on that page for your benefit!
      </p>
      <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
        {rows.map((row) => {
          const sqftLabel =
            row.sqft != null && row.sqft > 0 ? fmtSqft(row.sqft) : null;
          const meta = [
            bedBathLabel(row.beds, row.baths),
            sqftLabel,
            row.priceLabel,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li key={row.key} className={rowClass}>
              {row.tag ? <span className={tagClass}>{row.tag}</span> : null}
              {row.href ? (
                <Link href={row.href} className={linkClass}>
                  {row.address}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{row.address}</span>
              )}
              <span className={metaClass}>{meta}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
