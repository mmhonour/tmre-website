"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type InterestingStat = {
  id?: string;
  eyebrow?: string;
  value: string;
  detail: string;
  href: string;
  town: string | null;
  kind: string;
  generatedAt: string;
};

type AdminView = {
  current: InterestingStat | null;
  homepage: InterestingStat | null;
  history: InterestingStat[];
  rotateIntervalMs: number;
  historyCap: number;
  updatedAt: string | null;
  error?: string;
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

function rotateMinutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m === 1 ? "1 min" : `${m} min`;
}

/**
 * Admin → Stats: browse the homepage interesting-stat pool (newest from each
 * stats_cache rebuild + daytime rotation).
 */
export default function AdminInterestingStatsPanel() {
  const [data, setData] = useState<AdminView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/interesting-stats", { cache: "no-store" });
      const json = (await r.json()) as AdminView;
      if (!r.ok) {
        setError(json.error || `HTTP ${r.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const homepage = data?.homepage ?? null;
  const history = data?.history ?? [];

  return (
    <div
      id="admin-stats-interesting"
      className="scroll-mt-24 rounded-2xl border border-navy/15 bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-navy/[0.04] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Interesting stats
          </p>
          <p className="mt-1 text-sm text-slate max-w-3xl">
            One new insight is written at the end of every{" "}
            <span className="font-mono text-[12px] text-navy">stats_cache</span>{" "}
            rebuild. The homepage rotates among recent ones (
            {data ? rotateMinutes(data.rotateIntervalMs) : "—"}) so the pulse
            changes during the day without waiting for the next rebuild.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:border-gold/50 hover:text-gold transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="px-5 sm:px-6 py-4 space-y-5">
        {loading && !data ? (
          <p className="font-mono text-[11px] text-charcoal/45">Loading…</p>
        ) : null}
        {error ? <p className="text-sm text-coral">{error}</p> : null}

        {homepage ? (
          <div className="rounded-xl border border-gold/35 bg-navy/[0.03] px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-gold">
              Homepage now
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-serif italic text-3xl text-navy leading-none">
                {homepage.value}
              </p>
              <p className="text-sm text-slate">{homepage.detail}</p>
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-charcoal/55">
              <div>
                <dt className="inline">kind </dt>
                <dd className="inline text-navy">{homepage.kind}</dd>
              </div>
              <div>
                <dt className="inline">written </dt>
                <dd className="inline">{formatWhen(homepage.generatedAt)}</dd>
              </div>
              <div>
                <dt className="inline">link </dt>
                <dd className="inline">
                  <Link
                    href={homepage.href}
                    className="text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                  >
                    {homepage.href}
                  </Link>
                </dd>
              </div>
            </dl>
          </div>
        ) : !loading ? (
          <p className="text-sm text-charcoal/55">
            No interesting stat yet — run a stats cache rebuild.
          </p>
        ) : null}

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-charcoal/45">
              Recent pool · newest first · cap {data?.historyCap ?? "—"}
            </p>
            <p className="font-mono text-[10px] text-charcoal/40">
              pool updated {formatWhen(data?.updatedAt)}
            </p>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-charcoal/50">History empty.</p>
          ) : (
            <ul className="divide-y divide-charcoal/[0.08] rounded-xl border border-charcoal/[0.1] overflow-hidden">
              {history.map((entry, i) => {
                const isLive =
                  homepage &&
                  (homepage.id
                    ? homepage.id === entry.id
                    : homepage.value === entry.value &&
                      homepage.detail === entry.detail);
                return (
                  <li
                    key={entry.id ?? `${entry.kind}-${entry.generatedAt}-${i}`}
                    className={`px-4 py-3 flex flex-wrap items-start gap-3 ${
                      isLive ? "bg-gold/[0.08]" : "bg-white"
                    }`}
                  >
                    <div className="w-16 shrink-0">
                      <p className="font-serif italic text-xl text-navy leading-none">
                        {entry.value}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate leading-snug">{entry.detail}</p>
                      <p className="mt-1 font-mono text-[10px] text-charcoal/45 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{entry.kind}</span>
                        {entry.town ? <span>{entry.town}</span> : null}
                        <span>{formatWhen(entry.generatedAt)}</span>
                        {isLive ? (
                          <span className="text-gold uppercase tracking-[0.12em]">
                            live
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
