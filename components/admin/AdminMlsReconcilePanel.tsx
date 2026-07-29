"use client";

import { useCallback, useState } from "react";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

type ListingRef = {
  mlsId: string;
  address: string | null;
  price: number | null;
  mlsStatus: string | null;
};

type Gap = { total: number; listings: ListingRef[] };

type TownResult = {
  town: TmreTown;
  mlsCount: number;
  dbCount: number;
  missingFromDb: Gap;
  staleInDb: Gap;
  ok: boolean;
  durationMs: number;
  fetchLimit?: number;
  statusErrors?: { status: string; message: string }[];
};

type Freshness = {
  lastIncrementalSync: string | null;
  latestFeedCacheKey: string;
  latestFeedGeneratedAt: string | null;
  latestFeedAgeMinutes: number | null;
  latestFeedRowCount: number | null;
};

type RowState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; result: TownResult }
  | { status: "error"; message: string };

function ageLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function priceLabel(price: number | null): string {
  if (price == null) return "—";
  return `$${Math.round(price).toLocaleString()}`;
}

/**
 * Does the website's inventory match the MLS right now? Compares by MLS number
 * only (never dates) — one town per request, looped in the browser.
 */
export default function AdminMlsReconcilePanel() {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (town: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(town)) next.delete(town);
      else next.add(town);
      return next;
    });
  };

  const run = useCallback(async () => {
    setRunning(true);
    setRows(
      Object.fromEntries(
        TMRE_TOWNS.map((town) => [town, { status: "idle" } as RowState]),
      ),
    );
    // Sequential: each town is ~4 slow RETS status queries. Never batch towns.
    for (const town of TMRE_TOWNS) {
      setRows((prev) => ({ ...prev, [town]: { status: "pending" } }));
      try {
        const res = await fetch(
          `/api/admin/mls-reconcile?town=${encodeURIComponent(town)}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as (TownResult & Freshness) & {
          error?: string;
        };
        if (!res.ok) {
          setRows((prev) => ({
            ...prev,
            [town]: {
              status: "error",
              message: body.error ?? `HTTP ${res.status}`,
            },
          }));
          continue;
        }
        setFreshness({
          lastIncrementalSync: body.lastIncrementalSync ?? null,
          latestFeedCacheKey: body.latestFeedCacheKey,
          latestFeedGeneratedAt: body.latestFeedGeneratedAt ?? null,
          latestFeedAgeMinutes: body.latestFeedAgeMinutes ?? null,
          latestFeedRowCount: body.latestFeedRowCount ?? null,
        });
        setRows((prev) => ({ ...prev, [town]: { status: "done", result: body } }));
      } catch (err) {
        setRows((prev) => ({
          ...prev,
          [town]: {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          },
        }));
      }
    }
    setRunning(false);
  }, []);

  const done = TMRE_TOWNS.map((t) => rows[t]).filter(
    (r): r is Extract<RowState, { status: "done" }> => r?.status === "done",
  );
  const totalMissing = done.reduce((sum, r) => sum + r.result.missingFromDb.total, 0);
  const totalStale = done.reduce((sum, r) => sum + r.result.staleInDb.total, 0);

  return (
    <div
      id="admin-mls-reconcile"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            MLS reconcile
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Compares the live MLS Active set against Postgres per town, by MLS
            number — never by date. Read-only: nothing is upserted or cached.
          </p>
          {done.length > 0 ? (
            <p className="mt-2 font-mono text-[10px] tracking-wide text-charcoal/50">
              {done.length}/{TMRE_TOWNS.length} towns ·{" "}
              <span className={totalMissing > 0 ? "text-coral" : "text-charcoal/50"}>
                {totalMissing} missing from DB
              </span>{" "}
              ·{" "}
              <span className={totalStale > 0 ? "text-coral" : "text-charcoal/50"}>
                {totalStale} stale in DB
              </span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="shrink-0 rounded-full border border-charcoal/15 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 transition-colors hover:border-charcoal/30 hover:text-navy disabled:opacity-40"
        >
          {running ? "Checking…" : "Run check"}
        </button>
      </div>

      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] grid gap-2 sm:grid-cols-2">
        <FreshnessCard
          label="Last incremental sync"
          value={ageLabel(freshness?.lastIncrementalSync ?? null)}
          detail={freshness?.lastIncrementalSync ?? "Run check to load"}
        />
        <FreshnessCard
          label="/latest feed cache built"
          value={
            freshness?.latestFeedAgeMinutes != null
              ? `${freshness.latestFeedAgeMinutes}m ago`
              : ageLabel(freshness?.latestFeedGeneratedAt ?? null)
          }
          detail={
            freshness
              ? `${freshness.latestFeedCacheKey}${
                  freshness.latestFeedRowCount != null
                    ? ` · ${freshness.latestFeedRowCount} rows`
                    : ""
                }`
              : "Run check to load"
          }
        />
      </div>

      <ul className="divide-y divide-charcoal/[0.06]">
        {TMRE_TOWNS.map((town) => {
          const state = rows[town] ?? { status: "idle" as const };
          const isOpen = expanded.has(town);
          const result = state.status === "done" ? state.result : null;
          const hasLists =
            result != null &&
            (result.missingFromDb.total > 0 || result.staleInDb.total > 0);

          return (
            <li key={town} className="px-5 sm:px-6 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    state.status === "done"
                      ? result?.ok
                        ? "bg-sage"
                        : "bg-coral"
                      : state.status === "error"
                        ? "bg-coral"
                        : state.status === "pending"
                          ? "bg-gold animate-pulse"
                          : "bg-charcoal/15"
                  }`}
                />
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-navy">
                  {town}
                </span>

                {state.status === "idle" ? (
                  <span className="font-mono text-[10px] text-charcoal/35">
                    not checked
                  </span>
                ) : null}
                {state.status === "pending" ? (
                  <span className="font-mono text-[10px] text-charcoal/45">
                    querying MLS…
                  </span>
                ) : null}
                {state.status === "error" ? (
                  <span className="font-mono text-[10px] text-coral break-all">
                    {state.message}
                  </span>
                ) : null}

                {result ? (
                  <>
                    <span className="font-mono text-[10px] text-charcoal/45 tabular-nums">
                      MLS {result.mlsCount} · DB {result.dbCount}
                    </span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        result.missingFromDb.total > 0
                          ? "text-coral"
                          : "text-charcoal/40"
                      }`}
                    >
                      missing {result.missingFromDb.total}
                    </span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        result.staleInDb.total > 0 ? "text-coral" : "text-charcoal/40"
                      }`}
                    >
                      stale {result.staleInDb.total}
                    </span>
                    <span className="font-mono text-[10px] text-charcoal/30 tabular-nums">
                      {(result.durationMs / 1000).toFixed(1)}s
                    </span>
                    {hasLists ? (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(town)}
                        aria-expanded={isOpen}
                        className="ml-auto shrink-0 rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 transition-colors hover:border-charcoal/30 hover:text-navy"
                      >
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    ) : (
                      <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase text-sage">
                        match
                      </span>
                    )}
                  </>
                ) : null}
              </div>

              {result?.statusErrors?.length ? (
                <p className="mt-1.5 font-mono text-[10px] text-coral break-words">
                  {result.statusErrors
                    .map((e) => `${e.status}: ${e.message}`)
                    .join(" · ")}{" "}
                  — MLS set is partial, treat “stale” with suspicion
                </p>
              ) : null}

              {result && isOpen ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <GapList
                    label="Missing from DB (MLS has it, site does not)"
                    gap={result.missingFromDb}
                  />
                  <GapList
                    label="Stale in DB (Active here, gone from MLS)"
                    gap={result.staleInDb}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="px-5 sm:px-6 py-3 border-t border-charcoal/[0.08] bg-cream/30">
        <p className="font-mono text-[10px] leading-snug text-charcoal/45">
          One town per request (RETS is slow) — towns run one after another and
          each row fills in as it finishes. Lists are capped at 25 entries per
          side; the counts are the real totals.
        </p>
      </div>
    </div>
  );
}

function FreshnessCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2.5">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm text-navy tabular-nums">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] text-charcoal/40 break-all">
        {detail}
      </p>
    </div>
  );
}

function GapList({ label, gap }: { label: string; gap: Gap }) {
  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-3 py-2.5">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
        {label} · {gap.total}
      </p>
      {gap.total === 0 ? (
        <p className="mt-1 font-mono text-[10px] text-charcoal/35">none</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1">
            {gap.listings.map((row) => (
              <li
                key={row.mlsId}
                className="font-mono text-[10px] leading-snug text-charcoal/70"
              >
                <span className="text-navy">{row.mlsId}</span>
                <span className="text-charcoal/40"> · </span>
                <span className="tabular-nums">{priceLabel(row.price)}</span>
                {row.mlsStatus ? (
                  <span className="text-charcoal/40"> · {row.mlsStatus}</span>
                ) : null}
                {row.address ? (
                  <span className="block text-charcoal/50 break-words">
                    {row.address}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {gap.total > gap.listings.length ? (
            <p className="mt-2 font-mono text-[10px] text-charcoal/40">
              + {gap.total - gap.listings.length} more (list capped)
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
