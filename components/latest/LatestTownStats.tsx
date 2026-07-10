"use client";

import Link from "next/link";
import { useEffect } from "react";
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
};

function TownUpdateCard({
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

  return (
    <div
      className={`rounded-2xl overflow-hidden bg-white border transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-navy/5 ${
        selected
          ? "border-gold/40 ring-1 ring-gold/20"
          : "border-charcoal/[0.08]"
      }`}
    >
      <button
        type="button"
        onClick={() => onTownSelect(row.town)}
        className="navy-gradient w-full flex items-baseline justify-between gap-2 px-4 lg:px-5 py-3 border-b border-white/10 text-left transition-colors hover:brightness-110"
        aria-pressed={selected}
      >
        <span
          className={`font-mono text-xs sm:text-sm tracking-[0.18em] uppercase text-gold ${
            selected ? "font-bold" : ""
          }`}
        >
          #{rank} ·{" "}
          <span className="underline decoration-gold/40 underline-offset-2 hover:decoration-gold">
            {label}
          </span>
        </span>
        <span className="font-mono text-lg tabular-nums font-semibold text-gold">
          {row.updateCount}
        </span>
      </button>
      <div className="flex items-baseline justify-between gap-2 px-4 lg:px-5 py-3">
        <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate shrink-0">
          Latest
        </span>
        {latestHref ? (
          <Link
            href={latestHref}
            className="font-mono tabular-nums text-navy text-sm font-medium text-right hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            {latestLabel}
          </Link>
        ) : (
          <span className="font-mono tabular-nums text-navy text-sm font-medium text-right">
            {latestLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export default function LatestTownStats({
  stats,
  loading = false,
  selectedTown,
  onTownSelect,
}: LatestTownStatsProps) {
  const visibleStats = selectedTown
    ? stats.filter((row) => row.town === selectedTown)
    : stats;

  // Keep snapshots primed whenever the sidebar is shown.
  useEffect(() => {
    if (loading) return;
    void prefetchAllTownSnapshots();
  }, [loading]);

  return (
    <aside className="mt-4 lg:mt-0 lg:shrink-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2 pb-1 shrink-0">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">Stats</p>
        <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate text-right">
          {selectedTown
            ? `${normalizeTownName(selectedTown)} market`
            : "Towns by update volume · 24h"}
        </p>
      </div>
      <div className="pt-4 space-y-2">
      {loading ? (
        <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 animate-pulse h-32" />
      ) : visibleStats.length === 0 ? (
        <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-5">
          <p className="font-mono text-[10px] text-slate">No town updates in the last 24 hours.</p>
        </div>
      ) : (
        visibleStats.map((row, index) => (
          <TownUpdateCard
            key={row.town}
            row={row}
            rank={selectedTown ? 1 : index + 1}
            selected={selectedTown === row.town}
            onTownSelect={onTownSelect}
          />
        ))
      )}

      {selectedTown ? <LatestIntelligenceTownSnapshot town={selectedTown} /> : null}
      </div>
    </aside>
  );
}
