"use client";

import { useEffect, useMemo, useState } from "react";
import SnapshotCollapseToggle from "@/components/SnapshotCollapseToggle";
import {
  buildVintageBucketSnapshots,
  sortVintageBucketSnapshots,
  type VintageSnapshotMetric,
  type VintageSnapshotValueSignal,
  type VintageListingRow,
  type VintageStatsSortDir,
  type VintageStatsSortKey,
} from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";

type TxFilter = "all" | "sale" | "rental";

export function vintageSnapshotPanelKey(id: VintageBucketId): string {
  return `vintage:${id}`;
}

function snapshotValueColorClass(
  signal: VintageSnapshotValueSignal | undefined,
): string {
  if (signal === "good") return "text-sage";
  if (signal === "bad") return "text-coral";
  return "text-navy";
}

function formatAvgScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return score.toFixed(1);
}

function VintageSnapshotCardBody({
  metrics,
  vintageLabel,
  onListingsClick,
}: {
  metrics: VintageSnapshotMetric[];
  vintageLabel: string;
  onListingsClick?: () => void;
}) {
  return (
    <div className="grid grid-cols-2">
      {metrics.map((metric) => {
        const valueColor = snapshotValueColorClass(metric.valueSignal);
        return (
          <div
            key={metric.label}
            className="flex flex-col items-center text-center px-3 py-3 border-b border-r border-charcoal/[0.04] odd:last:col-span-2"
          >
            <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate/70 mb-1 font-bold">
              {metric.label}
            </span>
            {metric.label === "Listings" && onListingsClick ? (
              <button
                type="button"
                onClick={onListingsClick}
                className={`font-mono text-sm tabular-nums leading-tight hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2 ${valueColor}`}
                aria-label={`View ${vintageLabel} listings on deal board`}
              >
                {metric.value}
              </button>
            ) : (
              <p
                className={`font-mono text-sm tabular-nums leading-tight ${valueColor}`}
              >
                {metric.value}
              </p>
            )}
            <p className={`font-mono text-[9px] leading-tight mt-0.5 ${valueColor}`}>
              {metric.trend}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function VintageSnapshotSummaryBody({
  metrics,
  vintageLabel,
  onListingsClick,
  avgScore,
}: {
  metrics: VintageSnapshotMetric[];
  vintageLabel: string;
  onListingsClick?: () => void;
  avgScore: number | null;
}) {
  const listings = metrics.find((m) => m.label === "Listings")?.value ?? "—";
  const medianPrice =
    metrics.find((m) => m.label === "Median price")?.value ?? "—";
  const medianDomRaw =
    metrics.find((m) => m.label === "Median DOM")?.value ?? "—";
  const medianDom =
    medianDomRaw !== "—" ? `${medianDomRaw} DOM` : "—";

  return (
    <div className="px-3 py-2 font-mono text-[10px] leading-snug tabular-nums text-slate">
      <span className="text-navy font-semibold tabular-nums">
        {formatAvgScore(avgScore)}
      </span>
      <span className="text-slate/35" aria-hidden>
        {" "}
        ·{" "}
      </span>
      {onListingsClick ? (
        <button
          type="button"
          onClick={onListingsClick}
          className="text-navy font-medium hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2"
          aria-label={`View ${vintageLabel} listings on deal board`}
        >
          {listings} listings
        </button>
      ) : (
        <span className="text-navy font-medium">{listings} listings</span>
      )}
      <span className="text-slate/35" aria-hidden>
        {" "}
        ·{" "}
      </span>
      <span className="text-navy">{medianPrice}</span>
      <span className="text-slate/35" aria-hidden>
        {" "}
        ·{" "}
      </span>
      <span>{medianDom}</span>
    </div>
  );
}

function vintagePanelTitle(tx: TxFilter): string {
  if (tx === "rental") return "Rentals by vintage";
  return "Sales by vintage";
}

function vintageSnapshotTitle(label: string): string {
  return `${label} Vintage`;
}

function vintageApiKind(tx: TxFilter): "sale" | "rental" {
  return tx === "rental" ? "rental" : "sale";
}

function SortChip({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: VintageStatsSortDir;
  onClick: () => void;
}) {
  const arrow = active ? (dir === "desc" ? "↓" : "↑") : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded transition-colors ${
        active
          ? "text-gold bg-gold/10"
          : "text-slate/55 hover:text-navy"
      }`}
      aria-pressed={active}
      aria-label={`Sort by ${label}${active ? `, ${dir === "desc" ? "descending" : "ascending"}` : ""}`}
    >
      {label}
      {arrow ? ` ${arrow}` : ""}
    </button>
  );
}

export default function IntelligenceVintageStats({
  title,
  listings,
  tx,
  city,
  collapsible = false,
  expandedKeys,
  onToggleExpanded,
  onVintageListingsClick,
}: {
  title: string;
  listings: VintageListingRow[];
  tx: TxFilter;
  /** Town name or "All" — loads cached avg-score-by-vintage. */
  city: string;
  collapsible?: boolean;
  expandedKeys?: Set<string>;
  onToggleExpanded?: (key: string) => void;
  onVintageListingsClick?: (bucketId: VintageBucketId) => void;
}) {
  const [sortKey, setSortKey] = useState<VintageStatsSortKey>("score");
  const [sortDir, setSortDir] = useState<VintageStatsSortDir>("desc");
  const [cachedScores, setCachedScores] = useState<Map<
    VintageBucketId,
    number | null
  > | null>(null);

  const kind = vintageApiKind(tx);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      city: city === "All" ? "All" : city,
      kind,
    });
    void fetch(`/api/avg-score-by-vintage?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (body: {
          buckets?: { id: VintageBucketId; avgScore: number | null }[];
        } | null) => {
          if (cancelled || !body?.buckets) return;
          const map = new Map<VintageBucketId, number | null>();
          for (const bucket of body.buckets) {
            map.set(bucket.id, bucket.avgScore);
          }
          setCachedScores(map);
        },
      )
      .catch(() => {
        /* board-row averages still work */
      });
    return () => {
      cancelled = true;
    };
  }, [city, kind]);

  const snapshots = useMemo(() => {
    const built = buildVintageBucketSnapshots(
      listings,
      cachedScores ?? undefined,
    );
    return sortVintageBucketSnapshots(built, sortKey, sortDir);
  }, [listings, cachedScores, sortKey, sortDir]);

  const toggleSort = (key: VintageStatsSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  if (snapshots.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="pb-1 shrink-0">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          {vintagePanelTitle(tx)}
        </p>
        <p className="font-mono text-[9px] tracking-wide text-slate/70 mt-0.5 truncate">
          {title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="font-mono text-[8px] tracking-[0.14em] uppercase text-slate/40 mr-0.5">
            Sort
          </span>
          <SortChip
            label="Vintage"
            active={sortKey === "vintage"}
            dir={sortDir}
            onClick={() => toggleSort("vintage")}
          />
          <SortChip
            label="Score"
            active={sortKey === "score"}
            dir={sortDir}
            onClick={() => toggleSort("score")}
          />
        </div>
      </div>

      {snapshots.map((snapshot) => {
        const panelKey = vintageSnapshotPanelKey(snapshot.id);
        const expanded = !collapsible || expandedKeys?.has(panelKey) === true;
        const showExpanded = collapsible ? expanded : true;
        const panelTitle = vintageSnapshotTitle(snapshot.label);
        const handleListingsClick = onVintageListingsClick
          ? () => onVintageListingsClick(snapshot.id)
          : undefined;

        return (
          <div
            key={snapshot.id}
            className={`bg-white border border-charcoal/[0.06] overflow-hidden ${
              showExpanded ? "rounded-2xl" : "rounded-xl"
            }`}
          >
            <div
              className={`navy-gradient border-b border-white/10 flex items-center gap-2 ${
                showExpanded ? "px-5 py-4" : "px-3 py-2"
              }`}
            >
              <p
                className={`flex-1 min-w-0 flex items-center justify-center gap-2 font-mono uppercase text-gold font-bold truncate ${
                  showExpanded
                    ? "text-[10px] tracking-[0.2em]"
                    : "text-[9px] tracking-[0.18em]"
                }`}
              >
                <span
                  className="shrink-0 tabular-nums text-white"
                  title="Average Goldilocks score for Active listings in this vintage"
                >
                  {formatAvgScore(snapshot.avgScore)}
                </span>
                <span className="truncate">{snapshot.label}</span>
                <span className="shrink-0">Vintage</span>
              </p>
              {collapsible && onToggleExpanded ? (
                <SnapshotCollapseToggle
                  expanded={expanded}
                  onToggle={() => onToggleExpanded(panelKey)}
                  label={panelTitle}
                />
              ) : null}
            </div>
            {showExpanded ? (
              <VintageSnapshotCardBody
                metrics={snapshot.metrics}
                vintageLabel={panelTitle}
                onListingsClick={handleListingsClick}
              />
            ) : (
              <VintageSnapshotSummaryBody
                metrics={snapshot.metrics}
                vintageLabel={panelTitle}
                onListingsClick={handleListingsClick}
                avgScore={snapshot.avgScore}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
