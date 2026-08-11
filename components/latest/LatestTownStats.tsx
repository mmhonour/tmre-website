"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LatestIntelligenceTownSnapshot, {
  prefetchAllTownSnapshots,
} from "@/components/latest/LatestIntelligenceTownSnapshot";
import { normalizeTownName } from "@/lib/tmre-towns";
import { mlsTimestampMs } from "@/lib/mls-time";
import { listingDetailHref } from "@/lib/listing-url";
import type { TownUpdateStat } from "@/lib/latest-listings";

function formatLatest(iso: string | null): string {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

type LatestTownStatsProps = {
  stats: TownUpdateStat[];
  loading?: boolean;
  selectedTown: string | null;
  onTownSelect: (town: string) => void;
  className?: string;
  /** When false, omit the Stats eyebrow (e.g. inside a titled drawer). */
  showHeading?: boolean;
};

/**
 * One side panel per town: update volume + latest stamp (former card) fused with
 * the market snapshot metrics. Expand/collapse keeps the header visible.
 */
function LatestTownSidePanel({
  row,
  rank,
  selected,
  onTownSelect,
}: {
  row: TownUpdateStat;
  rank: number;
  selected: boolean;
  onTownSelect: (town: string) => void;
}) {
  const label = normalizeTownName(row.town);
  const latestLabel = formatLatest(row.latestUpdate);
  const latestHref = row.latestListingId
    ? listingDetailHref(row.latestListingId, row.latestListingAddress, row.town)
    : null;
  const [expanded, setExpanded] = useState(selected);

  useEffect(() => {
    if (selected) setExpanded(true);
  }, [selected]);

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition-all ${
        selected
          ? "border-gold/40 ring-1 ring-gold/20"
          : "border-charcoal/[0.08]"
      }`}
    >
      <div className="navy-gradient flex w-full items-stretch border-b border-white/10">
        <button
          type="button"
          onClick={() => onTownSelect(row.town)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:brightness-110 lg:px-4"
          aria-pressed={selected}
          title={`${label}: ${row.updateCount} updates in the last 24 hours. Rank #${rank} by update volume.`}
        >
          <span
            className={`min-w-0 truncate font-mono text-[11px] tracking-[0.14em] uppercase text-gold lg:text-xs ${
              selected ? "font-bold" : ""
            }`}
          >
            <span className="text-gold/70">#{rank}</span>
            <span className="text-gold/40"> · </span>
            <span className="underline decoration-gold/40 underline-offset-2 hover:decoration-gold">
              {label}
            </span>
          </span>
          <span
            className="ml-auto inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap font-mono text-gold"
            title="Status updates in the last 24 hours"
          >
            <span className="text-sm font-semibold tabular-nums leading-none">
              {row.updateCount}
            </span>
            <span className="text-[9px] tracking-[0.12em] uppercase text-gold/70">
              {row.updateCount === 1 ? "update" : "updates"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={
            expanded ? `Collapse ${label} market panel` : `Expand ${label} market panel`
          }
          className="inline-flex w-9 shrink-0 items-center justify-center border-l border-white/10 text-gold/80 transition-colors hover:bg-white/5 hover:text-gold"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {expanded ? (
              <path d="M3 10l5-5 5 5" />
            ) : (
              <path d="M3 6l5 5 5-5" />
            )}
          </svg>
        </button>
      </div>

      {expanded ? (
        <>
          <div className="flex items-center justify-between gap-2 whitespace-nowrap border-b border-charcoal/[0.06] px-3 py-2 lg:px-4">
            <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
              Latest update
            </span>
            {latestHref ? (
              <Link
                href={latestHref}
                className="min-w-0 truncate text-right font-mono text-xs font-medium tabular-nums text-navy underline decoration-charcoal/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
              >
                {latestLabel}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-right font-mono text-xs font-medium tabular-nums text-navy">
                {latestLabel}
              </span>
            )}
          </div>
          <LatestIntelligenceTownSnapshot town={row.town} embedded />
        </>
      ) : null}
    </div>
  );
}

export default function LatestTownStats({
  stats,
  loading = false,
  selectedTown,
  onTownSelect,
  className = "",
  showHeading = true,
}: LatestTownStatsProps) {
  const visibleStats = selectedTown
    ? stats.filter((row) => row.town === selectedTown)
    : stats;

  useEffect(() => {
    if (loading) return;
    void prefetchAllTownSnapshots();
  }, [loading]);

  return (
    <aside className={`space-y-2 lg:shrink-0 ${className}`.trim()}>
      {showHeading ? (
        <div className="flex shrink-0 items-baseline justify-between gap-2 pb-1">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Stats
          </p>
          <p className="text-right font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
            {selectedTown
              ? `${normalizeTownName(selectedTown)} market`
              : "Towns by update volume · 24h"}
          </p>
        </div>
      ) : (
        <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
          {selectedTown
            ? `${normalizeTownName(selectedTown)} market`
            : "Towns by update volume · 24h"}
        </p>
      )}
      <div className={`space-y-2 ${showHeading ? "pt-4" : ""}`}>
        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl border border-charcoal/[0.08] bg-white p-5" />
        ) : visibleStats.length === 0 ? (
          <div className="rounded-2xl border border-charcoal/[0.08] bg-white p-5">
            <p className="font-mono text-[10px] text-slate">
              No town updates in the last 24 hours.
            </p>
          </div>
        ) : (
          visibleStats.map((row, index) => (
            <LatestTownSidePanel
              key={row.town}
              row={row}
              rank={selectedTown ? 1 : index + 1}
              selected={selectedTown === row.town}
              onTownSelect={onTownSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
