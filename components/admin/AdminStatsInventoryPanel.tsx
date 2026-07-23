"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminInterestingStatsPanel from "@/components/admin/AdminInterestingStatsPanel";
import AdminPriceBucketsPanel from "@/components/admin/AdminPriceBucketsPanel";
import { adminPostgresTableHref } from "@/lib/admin-nav";
import type {
  StatsInventoryCategory,
  StatsInventoryEntry,
  StatsStorageMedium,
} from "@/lib/admin-stats-inventory";
import {
  statsInventoryKeyFieldLabel,
  statsInventoryPostgresTable,
} from "@/lib/admin-stats-inventory";

type MediumMeta = Record<StatsStorageMedium, { label: string; short: string }>;

type LiveCounts = {
  measuredAt: string;
  statsCacheTotal: number;
  byEntryId: Record<string, number | null>;
};

type InventoryResponse = {
  categories: StatsInventoryCategory[];
  entries: StatsInventoryEntry[];
  groups: { category: StatsInventoryCategory; entries: StatsInventoryEntry[] }[];
  mediums: MediumMeta;
  live: LiveCounts | null;
  error?: string;
};

const MEDIUM_PILL: Record<StatsStorageMedium, string> = {
  postgres: "border-sage/40 bg-sage/[0.12] text-sage",
  memory: "border-coral/35 bg-coral/[0.1] text-coral",
  file: "border-gold/40 bg-gold/[0.12] text-gold",
  r2: "border-navy/30 bg-navy/[0.08] text-navy",
  blobs: "border-charcoal/25 bg-charcoal/[0.06] text-charcoal/70",
  browser: "border-charcoal/20 bg-cream text-charcoal/60",
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function MediumPill({
  medium,
  label,
}: {
  medium: StatsStorageMedium;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase whitespace-nowrap ${MEDIUM_PILL[medium]}`}
    >
      {label}
    </span>
  );
}

function PostgresTableLink({ table }: { table: string }) {
  const href = adminPostgresTableHref(table);
  return (
    <a
      href={href}
      className="font-mono text-[11px] text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
      title={`Open ${table} on the Postgres tab`}
      onClick={(e) => {
        // Same-page tab switch: update URL and notify AdminTabbedLayout.
        e.preventDefault();
        const url = new URL(href, window.location.origin);
        window.history.pushState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
    >
      {table}
    </a>
  );
}

/**
 * Admin catalog of every stats / cache store — categorized with storage medium
 * and live Postgres row counts where probeable.
 */
export default function AdminStatsInventoryPanel() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediumFilter, setMediumFilter] = useState<StatsStorageMedium | "all">(
    "all",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats-inventory", { cache: "no-store" });
      const body = (await res.json()) as InventoryResponse;
      if (!res.ok && !body.groups) {
        setError(body.error ?? "Failed to load stats inventory");
        return;
      }
      setData(body);
      if (body.error) setError(body.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    if (!data?.groups) return [];
    if (mediumFilter === "all") return data.groups;
    return data.groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) => e.medium === mediumFilter),
      }))
      .filter((g) => g.entries.length > 0);
  }, [data, mediumFilter]);

  const mediumCounts = useMemo(() => {
    const counts: Partial<Record<StatsStorageMedium, number>> = {};
    for (const entry of data?.entries ?? []) {
      counts[entry.medium] = (counts[entry.medium] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  const live = data?.live;

  return (
    <div
      id="admin-stats-inventory"
      className="scroll-mt-24 space-y-6"
    >
      <AdminInterestingStatsPanel />

      <AdminPriceBucketsPanel />

      <div className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              Stats storage map
            </p>
            <p className="mt-1 text-sm text-slate max-w-2xl">
              Where every product statistic and cache lives — Postgres, memory,
              files, R2, or the browser — grouped by purpose. Live counts cover
              probeable Postgres rows; memory/file/R2 stores show as —.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 rounded-lg border border-charcoal/15 bg-cream/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-cream disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div className="px-5 sm:px-6 py-4 space-y-4">
          <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 px-4 py-3 text-sm text-slate max-w-3xl space-y-2">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
              How to read Table vs Key vs Code
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm leading-snug">
              <li>
                <span className="font-medium text-navy">Table</span> — the
                Postgres table that holds the state (click through to the{" "}
                <Link
                  href="/admin?tab=postgres"
                  className="text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                >
                  Postgres
                </Link>{" "}
                schema card).
              </li>
              <li>
                <span className="font-medium text-navy">Key</span> — how a row is
                addressed <em>inside</em> that table. For most market/feed/deal
                caches this is the{" "}
                <code className="font-mono text-[12px]">stats_cache.cache_key</code>{" "}
                value pattern — <strong>not</strong> a filesystem path, and not
                usually “a column name” unless noted (e.g. Goldilocks columns on{" "}
                <code className="font-mono text-[12px]">listings</code>).
              </li>
              <li>
                <span className="font-medium text-navy">Code</span> — the TypeScript
                module path that owns read/write for this state.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                "postgres",
                "memory",
                "file",
                "r2",
                "blobs",
                "browser",
              ] as StatsStorageMedium[]
            ).map((medium) => (
              <button
                key={medium}
                type="button"
                onClick={() =>
                  setMediumFilter((prev) =>
                    prev === medium ? "all" : medium,
                  )
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-opacity ${
                  mediumFilter === "all" || mediumFilter === medium
                    ? "opacity-100"
                    : "opacity-40"
                } ${MEDIUM_PILL[medium]}`}
              >
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                  {data?.mediums[medium]?.short ?? medium}
                </span>
                <span className="font-mono text-[10px] tabular-nums opacity-70">
                  {mediumCounts[medium] ?? 0}
                </span>
              </button>
            ))}
            {mediumFilter !== "all" ? (
              <button
                type="button"
                onClick={() => setMediumFilter("all")}
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45 hover:text-navy"
              >
                Clear filter
              </button>
            ) : null}
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-charcoal/65">
            <div>
              <dt className="inline text-charcoal/40">stats_cache rows: </dt>
              <dd className="inline tabular-nums text-navy font-semibold">
                {live ? live.statsCacheTotal.toLocaleString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="inline text-charcoal/40">catalog entries: </dt>
              <dd className="inline tabular-nums">
                {(data?.entries.length ?? 0).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="inline text-charcoal/40">measured: </dt>
              <dd className="inline">{formatWhen(live?.measuredAt)}</dd>
            </div>
          </dl>

          {error ? (
            <p className="text-sm text-coral">{error}</p>
          ) : null}
        </div>
      </div>

      <div
        id="admin-stats-months-supply"
        className="scroll-mt-24 rounded-2xl border border-navy/15 bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-navy/[0.04]">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Months supply — required cache
          </p>
          <p className="mt-1 text-sm text-slate max-w-3xl">
            Months supply is never computed as a page-blocking step. It is
            precomputed into{" "}
            <PostgresTableLink table="stats_cache" /> for every market slice
            below, then read by Stats, Intelligence, and related APIs.
          </p>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-3 text-sm text-slate">
          <p>
            <span className="font-medium text-navy">Dimensions (always cached):</span>{" "}
            each TMRE town (+ All Towns) × occupancy (For Sale / For Rental) ×
            property class (All types / Homes / Multi-family / Condos). With 7
            towns that is{" "}
            <span className="font-mono tabular-nums text-navy">8 × 2 × 4 = 64</span>{" "}
            values (plus an index row).
          </p>
          <p>
            <span className="font-medium text-navy">Formula:</span> active
            inventory count ÷ trailing 3-month average closings for that same
            town × occupancy × property class.
          </p>
          <p>
            <span className="font-medium text-navy">Finer filters</span> (beds,
            baths, zip, price, vintage, board status, …) may adjust the
            numerator after listings are returned, using the cached average
            closings for the matching base slice — they must not delay the
            listing response.
          </p>
          <p className="font-mono text-[11px] text-charcoal/55">
            Keys: months-supply:{"{town|All}"}:{"{sale|rental}"}:{"{all|homes|multi|condos}"}{" "}
            · Index: months-supply-index:All:all · Rebuild: rebuildStatsCache →
            rebuildMonthsSupplyCache · API: GET /api/months-supply
          </p>
          <p className="font-mono text-[11px] text-charcoal/55">
            Live rows with prefix months-supply:{" "}
            <span className="tabular-nums text-navy font-semibold">
              {live?.byEntryId["months-supply"] == null
                ? "—"
                : live.byEntryId["months-supply"].toLocaleString()}
            </span>
          </p>
        </div>
      </div>

      {loading && !data ? (
        <p className="font-mono text-[11px] text-charcoal/45 px-1">
          Loading inventory…
        </p>
      ) : null}

      {groups.map(({ category, entries }) => (
        <section
          key={category.id}
          id={`admin-stats-${category.id}`}
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm"
        >
          <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/30">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              {category.label}
            </p>
            <p className="mt-1 text-sm text-slate max-w-3xl">{category.description}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-charcoal/[0.08] font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40">
                  <th className="px-5 sm:px-6 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Stored in</th>
                  <th className="px-3 py-2.5 font-medium">Table</th>
                  <th className="px-3 py-2.5 font-medium">Key</th>
                  <th className="px-3 py-2.5 font-medium text-right">Rows</th>
                  <th className="px-5 sm:px-6 py-2.5 font-medium">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.06]">
                {entries.map((entry) => {
                  const count = live?.byEntryId[entry.id];
                  const mediumLabel =
                    data?.mediums[entry.medium]?.short ?? entry.medium;
                  const table = statsInventoryPostgresTable(entry);
                  const keyField = statsInventoryKeyFieldLabel(entry);
                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="px-5 sm:px-6 py-3">
                        <p className="text-sm text-navy font-medium leading-snug">
                          {entry.name}
                        </p>
                        {entry.notes ? (
                          <p className="mt-1 text-xs text-charcoal/50 max-w-xs leading-snug">
                            {entry.notes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <MediumPill medium={entry.medium} label={mediumLabel} />
                      </td>
                      <td className="px-3 py-3">
                        {table ? (
                          <PostgresTableLink table={table} />
                        ) : (
                          <span className="font-mono text-[11px] text-charcoal/35">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/35 mb-0.5">
                          {keyField}
                        </p>
                        <code className="font-mono text-[11px] text-charcoal/70 break-all">
                          {entry.keyPattern}
                        </code>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-sm text-navy">
                        {count == null ? "—" : count.toLocaleString()}
                      </td>
                      <td className="px-5 sm:px-6 py-3">
                        <code
                          className="font-mono text-[10px] text-charcoal/55 break-all"
                          title="Source module path (repo file), not a database field"
                        >
                          {entry.owner}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
