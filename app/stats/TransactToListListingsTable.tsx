"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listingDetailHref } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import type { StatsListingRow } from "@/lib/stats-listing-rows";
import { TRANSACT_TO_LIST_LABEL } from "@/lib/market-pulse-defaults";
import { statsTransactToListListingsTitle } from "./stats-labels";
import { STATS_SCROLL_MT } from "./stats-scroll";
import type { StatsKind, Town } from "./stats-towns";

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

type SortKey = "address" | "listDate" | "original" | "closed" | "pct" | "gap";
type SortDir = "asc" | "desc";

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
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

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function rowPct(row: StatsListingRow): number | null {
  if (
    row.closedPrice == null ||
    row.closedPrice <= 0 ||
    row.originalListPrice == null ||
    row.originalListPrice <= 0
  ) {
    return null;
  }
  return (row.closedPrice / row.originalListPrice) * 100;
}

function rowGap(row: StatsListingRow): number | null {
  if (row.closedPrice == null || row.originalListPrice == null) return null;
  return row.closedPrice - row.originalListPrice;
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

export default function TransactToListListingsTable({
  town,
  kind,
  rows,
  loading,
}: {
  town: Town;
  kind: StatsKind;
  rows: StatsListingRow[];
  loading: boolean;
}) {
  const isRental = kind === "rental";
  const noun = isRental ? "leases" : "sales";
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("listDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setPage(0);
  }, [town, kind, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "address" || key === "listDate" ? "asc" : "desc");
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "address": {
          const cmp = a.address.localeCompare(b.address, undefined, {
            sensitivity: "base",
          });
          return sortDir === "asc" ? cmp : -cmp;
        }
        case "listDate":
          return compareNullable(parseMs(a.listDate), parseMs(b.listDate), sortDir);
        case "original":
          return compareNullable(a.originalListPrice ?? null, b.originalListPrice ?? null, sortDir);
        case "closed":
          return compareNullable(a.closedPrice ?? null, b.closedPrice ?? null, sortDir);
        case "pct":
          return compareNullable(rowPct(a), rowPct(b), sortDir);
        case "gap":
          return compareNullable(rowGap(a), rowGap(b), sortDir);
      }
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div id="transact-to-list-listings" className={STATS_SCROLL_MT}>
      <div className="mb-4 stats-print-screen-only">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-1">
          {statsTransactToListListingsTitle(kind, town)}
        </p>
        <p className="font-serif text-2xl text-navy">
          Closed {noun} · {town}
        </p>
        <p className="text-sm text-charcoal/70 mt-2 max-w-2xl">
          Each closing that published both a first ask and a close price since 2024
          — the same pool as {TRANSACT_TO_LIST_LABEL} on the chart
          {sorted.length > 0 ? (
            <span className="text-charcoal/60">
              {" "}
              · {sorted.length.toLocaleString()} {noun}
            </span>
          ) : null}
          . Click a column header to sort.
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-charcoal/[0.08] overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 font-mono text-[10px] tracking-[0.2em] uppercase text-slate/50 animate-pulse">
            Loading {noun}…
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-5 py-10 font-mono text-[10px] tracking-[0.2em] uppercase text-slate/50">
            No {noun} with a published asking price yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[640px]">
                <thead className="border-b border-charcoal/[0.12] bg-cream">
                  <tr>
                    <SortHeader
                      label="Address"
                      sortKey="address"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label={isRental ? "Closing date" : "Date of sale"}
                      sortKey="listDate"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label="First ask"
                      sortKey="original"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label={isRental ? "Closed rent" : "Close"}
                      sortKey="closed"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label={TRANSACT_TO_LIST_LABEL}
                      sortKey="pct"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label="Gap"
                      sortKey="gap"
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
                    const pct = rowPct(row);
                    const gap = rowGap(row);
                    return (
                      <tr
                        key={`${row.town}-${row.mlsId}`}
                        {...listingHoverHandlers(id)}
                        className="border-b border-charcoal/[0.06] last:border-0 hover:bg-gold/5 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={href}
                            className="text-navy text-sm font-medium hover:text-gold transition-colors"
                          >
                            {row.address}
                          </Link>
                          <span className="block font-mono text-[10px] text-slate/60 mt-0.5">
                            <span className={ACCENT[row.town as Town] ?? "text-slate"}>
                              {row.town}
                            </span>
                            {" · "}#{row.mlsId}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {fmtDate(row.listDate)}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {row.originalListPrice != null ? fmt$(row.originalListPrice) : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-navy font-medium text-right">
                          {row.closedPrice != null ? fmt$(row.closedPrice) : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-navy font-medium text-right">
                          {pct != null ? `${pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono tabular-nums text-charcoal text-sm text-right">
                          {gap == null
                            ? "—"
                            : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${fmt$(Math.abs(gap))}`}
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
                  {Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of{" "}
                  {sorted.length.toLocaleString()}
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
