"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ColdGapSample = {
  mlsId: string;
  listingKey: string | null;
  town: string | null;
  photoCount: number;
  status: string | null;
};

type PhotoHealthResponse = {
  backend: "r2" | "sqlite";
  coldGap: {
    activeMissingStored: number;
    samples: ColdGapSample[];
    measuredAt: string;
  };
  proxy: {
    windowStartedAt: string;
    lastUpdatedAt: string;
    cacheHits: number;
    cacheMisses: number;
    fetchOk: number;
    fetchFail: number;
  };
  error?: string;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

/**
 * Short-lived Admin signal for why previously unviewed listings show
 * "No photos available" — Active rows with MLS photoCount but nothing in
 * R2/index yet, plus rolling 24h proxy hit/miss/fetch counters.
 */
export default function AdminPhotoHealthPanel() {
  const [data, setData] = useState<PhotoHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/photo-health", { cache: "no-store" });
      const body = (await res.json()) as PhotoHealthResponse;
      if (!res.ok) {
        setError(body.error ?? "Failed to load photo health");
        return;
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCounters = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/admin/photo-health", { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setResetting(false);
    }
  };

  const cold = data?.coldGap.activeMissingStored ?? 0;
  const proxy = data?.proxy;

  return (
    <div
      id="admin-photo-health"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Listing photo health
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Why unviewed Active listings can show &quot;No photos available&quot;:
            MLS reports photos, but nothing is in the {data?.backend === "r2" ? "R2" : "SQLite"}{" "}
            store yet until sync warm or a Photos-tab visit pulls them. Counters reset
            every 24h (or manually).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40 transition-colors"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void resetCounters()}
            disabled={resetting || loading}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-charcoal/20 text-charcoal/60 bg-white hover:bg-cream/80 disabled:opacity-40 transition-colors"
          >
            Reset 24h counters
          </button>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-4 space-y-4">
        {error ? (
          <p className="font-mono text-[10px] text-coral">{error}</p>
        ) : null}

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <div>
            <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
              Active cold gap
            </dt>
            <dd
              className={`mt-0.5 font-mono text-lg tabular-nums font-semibold ${
                cold > 0 ? "text-coral" : "text-sage"
              }`}
            >
              {loading && !data ? "…" : cold.toLocaleString()}
            </dd>
            <p className="mt-0.5 font-mono text-[10px] text-charcoal/45 leading-snug">
              Active rows with photoCount &gt; 0 and zero stored photos
            </p>
          </div>
          <div>
            <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
              Cache hits (24h)
            </dt>
            <dd className="mt-0.5 font-mono text-lg tabular-nums text-navy font-semibold">
              {proxy?.cacheHits.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
              Cache misses (24h)
            </dt>
            <dd className="mt-0.5 font-mono text-lg tabular-nums text-navy font-semibold">
              {proxy?.cacheMisses.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
              On-demand fetch fail
            </dt>
            <dd
              className={`mt-0.5 font-mono text-lg tabular-nums font-semibold ${
                (proxy?.fetchFail ?? 0) > 0 ? "text-coral" : "text-navy"
              }`}
            >
              {proxy?.fetchFail.toLocaleString() ?? "—"}
              <span className="ml-1 text-[11px] font-normal text-charcoal/40">
                / {proxy?.fetchOk.toLocaleString() ?? "—"} ok
              </span>
            </dd>
          </div>
        </dl>

        {proxy ? (
          <p className="font-mono text-[10px] text-charcoal/40">
            Window since {formatWhen(proxy.windowStartedAt)} · last event{" "}
            {formatWhen(proxy.lastUpdatedAt)} · backend {data?.backend ?? "—"}
          </p>
        ) : null}

        {data && data.coldGap.samples.length > 0 ? (
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 mb-2">
              Recent cold Active samples
            </p>
            <ul className="space-y-1.5">
              {data.coldGap.samples.map((row) => (
                <li
                  key={row.mlsId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-[11px]"
                >
                  <Link
                    href={`/listings/${encodeURIComponent(row.mlsId)}/photos`}
                    className="text-navy hover:text-gold underline underline-offset-2 decoration-navy/20"
                  >
                    {row.mlsId}
                  </Link>
                  <span className="text-charcoal/50">
                    {row.town ?? "—"} · {row.status ?? "Active"} ·{" "}
                    {row.photoCount} MLS photos
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-slate leading-relaxed max-w-3xl">
          <strong className="font-semibold text-navy">Short term:</strong> opening
          Photos now warms up to 40 images on demand (R2 + index). Thumbnails retry
          with <span className="font-mono">?fetch=1</span> when cold.
          <br />
          <strong className="font-semibold text-navy">Long term:</strong> keep the
          stable proxy URL, widen Active sync warm concurrency, and optionally put
          a public CDN hostname in front of hot R2 objects so browsers skip the
          Netlify hop after the first pull. CDN was always the delivery layer —
          the gap is cold inventory never pulled from MLS until first view.
        </p>
      </div>
    </div>
  );
}
