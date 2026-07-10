"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  IntelligenceTownSnapshot,
  SnapshotMetric,
  SnapshotValueSignal,
} from "@/lib/intelligence-town-snapshot-types";
import { intelligenceListingsHref } from "@/lib/intelligence-url";
import { statsMedianListingsHref } from "@/lib/stats-url";

/** Shared client map — warmed by Latest page bulk preload so town clicks are instant. */
const snapshotClientCache = new Map<string, IntelligenceTownSnapshot>();
const snapshotInFlight = new Map<string, Promise<IntelligenceTownSnapshot>>();
let bulkPrefetchPromise: Promise<void> | null = null;

export function getCachedTownSnapshot(town: string): IntelligenceTownSnapshot | null {
  return snapshotClientCache.get(town) ?? null;
}

export function primeTownSnapshots(snapshots: IntelligenceTownSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot?.town) snapshotClientCache.set(snapshot.town, snapshot);
  }
}

/** One-shot bulk load from stats_cache-backed API. */
export function prefetchAllTownSnapshots(): Promise<void> {
  if (snapshotClientCache.size >= 7) return Promise.resolve();
  if (bulkPrefetchPromise) return bulkPrefetchPromise;

  bulkPrefetchPromise = fetch("/api/intelligence/town-snapshots", {
    cache: "force-cache",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { snapshots: IntelligenceTownSnapshot[] };
      primeTownSnapshots(body.snapshots ?? []);
    })
    .catch((err) => {
      console.warn("[latest] town snapshot bulk prefetch failed", err);
    })
    .finally(() => {
      // Allow retry later if nothing landed.
      if (snapshotClientCache.size === 0) bulkPrefetchPromise = null;
    });

  return bulkPrefetchPromise;
}

export async function fetchTownSnapshot(
  town: string,
): Promise<IntelligenceTownSnapshot> {
  const cached = snapshotClientCache.get(town);
  if (cached) return cached;

  const existing = snapshotInFlight.get(town);
  if (existing) return existing;

  const promise = fetch(
    `/api/intelligence/town-snapshot?town=${encodeURIComponent(town)}`,
    { cache: "force-cache" },
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { snapshot: IntelligenceTownSnapshot };
      snapshotClientCache.set(town, body.snapshot);
      return body.snapshot;
    })
    .finally(() => {
      snapshotInFlight.delete(town);
    });

  snapshotInFlight.set(town, promise);
  return promise;
}

function snapshotValueColorClass(signal: SnapshotValueSignal | undefined): string {
  if (signal === "good") return "text-sage";
  if (signal === "bad") return "text-coral";
  return "text-navy";
}

function MetricCell({ metric, town }: { metric: SnapshotMetric; town: string }) {
  const valueColor = snapshotValueColorClass(metric.valueSignal);
  const medianHref = statsMedianListingsHref({
    city: town,
    kind: "sale",
    pool: "active",
    tx: "sale",
    cls: "residential",
    saleProperty: "all",
  });

  return (
    <div className="flex flex-col items-center text-center px-3 py-3 border-b border-r border-charcoal/[0.04] odd:last:col-span-2">
      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate/70 mb-1 font-bold">
        {metric.label}
      </span>
      {metric.label === "Median price" && metric.linkMedian ? (
        <Link
          href={medianHref}
          className={`font-mono text-sm tabular-nums leading-tight hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2 ${valueColor}`}
        >
          {metric.value}
        </Link>
      ) : (
        <p className={`font-mono text-sm tabular-nums leading-tight ${valueColor}`}>
          {metric.value}
        </p>
      )}
      {metric.action ? (
        <Link
          href={intelligenceListingsHref({
            city: town,
            status: metric.action,
            tx: "sale",
            cls: "residential",
            saleProperty: "all",
          })}
          className={`font-mono text-[9px] leading-tight mt-0.5 underline underline-offset-2 transition-colors hover:opacity-80 ${valueColor}`}
        >
          {metric.trend}
        </Link>
      ) : (
        <p className={`font-mono text-[9px] leading-tight mt-0.5 ${valueColor}`}>
          {metric.trend}
        </p>
      )}
    </div>
  );
}

type LatestIntelligenceTownSnapshotProps = {
  town: string;
};

export default function LatestIntelligenceTownSnapshot({
  town,
}: LatestIntelligenceTownSnapshotProps) {
  const [snapshot, setSnapshot] = useState<IntelligenceTownSnapshot | null>(
    () => getCachedTownSnapshot(town),
  );
  const [loading, setLoading] = useState(() => !getCachedTownSnapshot(town));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedTownSnapshot(town);
    if (cached) {
      setSnapshot(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    void prefetchAllTownSnapshots()
      .then(() => getCachedTownSnapshot(town) ?? fetchTownSnapshot(town))
      .then((next) => {
        if (!cancelled && next) setSnapshot(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setSnapshot(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [town]);

  if (loading && !snapshot) {
    return (
      <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 animate-pulse h-48" />
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-5">
        <p className="font-mono text-[10px] text-slate">
          {error ? `Market snapshot unavailable (${error})` : "Market snapshot unavailable."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-charcoal/[0.06] overflow-hidden rounded-2xl">
      <div className="navy-gradient border-b border-white/10 px-5 py-4">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold font-bold text-center truncate">
          {snapshot.title}
        </p>
      </div>
      <div className="grid grid-cols-2">
        {snapshot.metrics.map((metric) => (
          <MetricCell key={metric.label} metric={metric} town={snapshot.town} />
        ))}
      </div>
    </div>
  );
}
