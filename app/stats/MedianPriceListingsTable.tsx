"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { listingDetailHref } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import type { StatsKind, Town } from "./stats-towns";
import StatsChartPrintFrame from "./StatsChartPrintFrame";

const MedianPriceUnderlyingChart = dynamic(
  () => import("./MedianPriceUnderlyingChart"),
  { ssr: false },
);

export type MedianListingRow = {
  mlsId: string;
  listingKey: string | null;
  town: string;
  address: string;
  price: number | null;
  closedPrice: number | null;
  listDate: string | null;
  dom: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
};

type SortKey =
  | "town"
  | "address"
  | "price"
  | "closedPrice"
  | "listDate"
  | "dom"
  | "beds"
  | "sqft";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

const ACCENT: Record<Town, string> = {
  Norwalk: "text-sky",
  Westport: "text-gold",
  Wilton: "text-coral",
  Fairfield: "text-sage",
  Weston: "text-indigo-400",
  "New Canaan": "text-amber-400",
  Ridgefield: "text-rose-400",
};

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  return fmt$(n);
}

function rowClosedAmount(row: MedianListingRow): number | null {
  if (row.closedPrice != null && row.closedPrice > 0) return row.closedPrice;
  return null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function cityScopeLabel(townFilter: Town | "All"): string {
  if (townFilter !== "All") return ` · ${townFilter}`;
  return " · all towns";
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors ${
          active ? "text-navy" : "text-slate hover:text-navy"
        } ${align === "right" ? "justify-end" : ""}`}
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span className={`text-[8px] tabular-nums ${active ? "text-gold" : "text-slate/35"}`}>
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export default function MedianPriceListingsTable({
  rows,
  townFilter,
  loading,
  medianPrice,
  kind = "sale",
  mode = "median",
  priceBandLabel = null,
  period = null,
  sectionId = "median-price-listings",
  listingPool = "closed",
}: {
  rows: MedianListingRow[];
  townFilter: Town | "All";
  loading: boolean;
  medianPrice?: number | null;
  kind?: StatsKind;
  mode?: "median" | "price-band";
  priceBandLabel?: string | null;
  period?: string | null;
  sectionId?: string;
  listingPool?: "active" | "closed";
}) {
  const isRental = kind === "rental";
  const isPriceBand = mode === "price-band";
  const isActivePool = listingPool === "active";
  const priceColumnLabel = isRental ? "Monthly rent" : "List price";
  const closedPriceColumnLabel = isRental ? "Closed rent" : "Closed price";
  const showClosedPriceCol = !isActivePool;
  const dateColumnLabel = isActivePool
    ? "List date"
    : isRental
      ? "Closing date"
      : "Date of sale";
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("listDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setPage(0);
  }, [townFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "address" || key === "town" || key === "listDate" ? "asc" : "desc");
  }

  const filtered = useMemo(() => {
    const list =
      townFilter === "All" ? rows : rows.filter((r) => r.town === townFilter);

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "town":
          cmp = a.town.localeCompare(b.town, undefined, { sensitivity: "base" });
          break;
        case "address":
          cmp = a.address.localeCompare(b.address, undefined, { sensitivity: "base" });
          break;
        case "price":
          return compareNullable(a.price, b.price, sortDir);
        case "closedPrice":
          return compareNullable(rowClosedAmount(a), rowClosedAmount(b), sortDir);
        case "listDate":
          return compareNullable(parseMs(a.listDate), parseMs(b.listDate), sortDir);
        case "dom":
          return compareNullable(a.dom, b.dom, sortDir);
        case "beds": {
          const aBeds = a.beds ?? -1;
          const bBeds = b.beds ?? -1;
          cmp = aBeds - bBeds;
          if (cmp === 0) cmp = (a.baths ?? -1) - (b.baths ?? -1);
          break;
        }
        case "sqft":
          return compareNullable(a.sqft, b.sqft, sortDir);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, townFilter, sortKey, sortDir]);

  const computedMedian = useMemo(() => {
    if (isActivePool) {
      return median(filtered.map((r) => r.price).filter((p): p is number => p != null && p > 0));
    }
    return median(
      filtered
        .map((r) => rowClosedAmount(r))
        .filter((p): p is number => p != null),
    );
  }, [filtered, isActivePool]);
  const displayMedian = medianPrice ?? computedMedian;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const showTownCol = townFilter === "All";

  return (
    <div id={sectionId} className="scroll-mt-28">
      <div className="mb-4 stats-print-screen-only">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-1">
          {isPriceBand
            ? isRental
              ? "Leases by rent — underlying data"
              : "Sales by price — underlying data"
            : isRental
              ? "Median rent — underlying data"
              : "Median price — underlying data"}
        </p>
        <p className="font-serif text-2xl text-navy">
          {isPriceBand ? (
            <>
              {priceBandLabel ?? "Price band"}
              {townFilter !== "All" ? ` · ${townFilter}` : cityScopeLabel(townFilter)}
              {period ? (
                <>
                  {" "}
                  <span className="text-charcoal/50">·</span> {period} closed
                </>
              ) : null}
            </>
          ) : isRental ? (
            <>
              {isActivePool ? "Active rentals" : "Closed leases"}
              {townFilter !== "All" ? ` · ${townFilter}` : " · all towns"}
            </>
          ) : (
            <>
              {isActivePool ? "Active listings" : "Closed sales"}
              {townFilter !== "All" ? ` · ${townFilter}` : " · all towns"}
            </>
          )}
        </p>
        <p className="text-sm text-charcoal/70 mt-2 max-w-2xl">
          {isPriceBand ? (
            <>
              Closed MLS {isRental ? "leases" : "sales"} in this{" "}
              {isRental ? "rent" : "price"} band
              {filtered.length > 0 && (
                <span className="text-charcoal/60">
                  {" "}
                  · {filtered.length.toLocaleString()} {isRental ? "lease" : "sale"}
                  {filtered.length === 1 ? "" : "s"}
                </span>
              )}
              . Click a column header to sort.
            </>
          ) : isRental ? (
            <>
              {isActivePool
                ? "Active MLS rentals with list date and monthly rent. Median above matches your Intelligence snapshot"
                : "Closed MLS leases with closing date and closed rent. Median above is"}{" "}
              {!isActivePool && (
                <>
                  {displayMedian != null ? (
                    <span className="font-mono text-navy">{fmt$(displayMedian)}</span>
                  ) : (
                    "shown in the town cards"
                  )}
                  .
                </>
              )}
              {isActivePool && displayMedian != null && (
                <>
                  {" "}
                  at{" "}
                  <span className="font-mono text-navy">{fmt$(displayMedian)}</span>.
                </>
              )}
            </>
          ) : (
            <>
              {isActivePool
                ? "Active MLS listings with list price. Median above matches your Intelligence snapshot"
                : "Closed MLS sales with sale date and closed price. Median above is"}{" "}
              {!isActivePool && (
                <>
                  {displayMedian != null ? (
                    <span className="font-mono text-navy">{fmt$(displayMedian)}</span>
                  ) : (
                    "shown in the town cards"
                  )}
                  .
                </>
              )}
              {isActivePool && displayMedian != null && (
                <>
                  {" "}
                  at{" "}
                  <span className="font-mono text-navy">{fmt$(displayMedian)}</span>.
                </>
              )}
            </>
          )}
          {!isPriceBand && filtered.length > 0 && (
            <span className="text-charcoal/60">
              {" "}
              {filtered.length.toLocaleString()}{" "}
              {isActivePool
                ? filtered.length === 1
                  ? isRental
                    ? "rental"
                    : "listing"
                  : isRental
                    ? "rentals"
                    : "listings"
                : filtered.length === 1
                  ? isRental
                    ? "lease"
                    : "sale"
                  : isRental
                    ? "leases"
                    : "sales"}{" "}
              in this view.
            </span>
          )}{" "}
          {!isPriceBand ? "Click a column header to sort." : null}
        </p>
      </div>

      {!isPriceBand ? (
        <StatsChartPrintFrame chartId="median-underlying">
          <MedianPriceUnderlyingChart
            rows={rows}
            townFilter={townFilter}
            loading={loading}
            medianPrice={displayMedian}
            kind={kind}
            listingPool={listingPool}
          />
        </StatsChartPrintFrame>
      ) : null}

      <div className="rounded-2xl bg-white border border-charcoal/[0.08] overflow-hidden stats-print-screen-only">
        {loading ? (
          <div className="px-5 py-16 text-center font-mono text-[10px] tracking-[0.2em] uppercase text-slate animate-pulse">
            Loading listings…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-slate text-sm">
            {isPriceBand
              ? `No ${isRental ? "leases" : "closed sales"} in this ${isRental ? "rent" : "price"} band.`
              : isActivePool
                ? `No active ${isRental ? "rentals" : "listings"} available for this view.`
                : `No ${isRental ? "closed leases" : "closed sales"} available for this view.`}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[840px]">
                <thead>
                  <tr className="border-b border-charcoal/[0.12] bg-cream">
                    {showTownCol && (
                      <SortHeader
                        label="Town"
                        sortKey="town"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                    )}
                    <SortHeader
                      label="Address"
                      sortKey="address"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label={dateColumnLabel}
                      sortKey="listDate"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label={priceColumnLabel}
                      sortKey="price"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    {showClosedPriceCol && (
                      <SortHeader
                        label={closedPriceColumnLabel}
                        sortKey="closedPrice"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                        align="right"
                      />
                    )}
                    <SortHeader
                      label="DOM"
                      sortKey="dom"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label="Beds / baths"
                      sortKey="beds"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label="Sqft"
                      sortKey="sqft"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const id = row.listingKey?.trim() || row.mlsId;
                    const href = listingDetailHref(id, row.address, row.town);
                    return (
                      <tr
                        key={`${row.town}-${row.mlsId}`}
                        {...listingHoverHandlers(id)}
                        className="border-b border-charcoal/[0.06] last:border-0 hover:bg-gold/5 transition-colors"
                      >
                        {showTownCol && (
                          <td className="px-5 py-3">
                            <span
                              className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                                ACCENT[row.town as Town] ?? "text-slate"
                              }`}
                            >
                              {row.town}
                            </span>
                          </td>
                        )}
                        <td className="px-5 py-3">
                          <Link
                            href={href}
                            className="text-navy text-sm font-medium hover:text-gold transition-colors"
                          >
                            {row.address}
                          </Link>
                          <span className="block font-mono text-[10px] text-slate/60 mt-0.5">
                            #{row.mlsId}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {fmtDate(row.listDate)}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-navy font-medium text-right">
                          {fmtPrice(row.price)}
                        </td>
                        {showClosedPriceCol && (
                          <td className="px-5 py-3 font-mono tabular-nums text-navy font-medium text-right">
                            {fmtPrice(rowClosedAmount(row))}
                          </td>
                        )}
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {row.dom != null ? `${row.dom}d` : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {row.beds && row.baths
                            ? `${row.beds}/${row.baths}`
                            : row.beds
                              ? `${row.beds}bd`
                              : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {row.sqft ? row.sqft.toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-charcoal/[0.08] bg-cream/50">
                <span className="font-mono text-[10px] text-slate tracking-wide">
                  {safePage * PAGE_SIZE + 1}–
                  {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
                  {filtered.length.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider text-navy border border-charcoal/15 disabled:opacity-40 hover:border-gold/40 transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider text-navy border border-charcoal/15 disabled:opacity-40 hover:border-gold/40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
