"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import IntelTownStatsDrawer from "@/components/intelligence/IntelTownStatsDrawer";
import ClosedLookbackRangeSlider from "@/components/closed/ClosedLookbackRangeSlider";
import LatestLineRow from "@/components/latest/LatestLineRow";
import LatestSmoothScrollList from "@/components/latest/LatestSmoothScrollList";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";
import LatestTownStats from "@/components/latest/LatestTownStats";
import ExplorePageTabs from "@/components/explore/ExplorePageTabs";
import { closedExploreFeedUrl } from "@/lib/explore-tab-prefetch";
import { loadTabJson } from "@/lib/tab-data-prefetch";
import { prefetchAllTownSnapshots } from "@/components/latest/LatestIntelligenceTownSnapshot";
import { prefetchAllTownBoundaries } from "@/components/ZipBoundaryPopover";
import type { LatestListingRow } from "@/lib/latest-listings";
import {
  CLOSED_FEED_LIMIT,
  CLOSED_TOWN_EXPAND_LIMIT,
  closedHorizonDays,
  defaultClosedRange,
  formatClosedDayLabel,
  sliceClosedTownStats,
  type ClosedDailyCachePayload,
  type ClosedTownStat,
} from "@/lib/closed-shared";
import { latestRowActivityIso, latestRowActivityMs } from "@/lib/latest-activity";
import { prefetchMlsPhotoThumbsOrdered } from "@/lib/prefetch-listing-images";
import { mlsTimestampMs } from "@/lib/mls-time";
import { TMRE_TOWNS_LABEL, isTmreTown, normalizeZip } from "@/lib/tmre-towns";

type ClosedApiResponse = {
  listings: LatestListingRow[];
  count: number;
  from: string;
  to: string;
  daily?: ClosedDailyCachePayload | null;
};

const LOCAL_DATE_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "numeric",
});

const LOCAL_DATE_LABEL_FMT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function localDateKey(iso: string | null | undefined): string {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return "unknown";
  return LOCAL_DATE_KEY_FMT.format(new Date(t));
}

function localDateLabel(iso: string | null | undefined): string {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return "Undated";
  const fullDate = LOCAL_DATE_LABEL_FMT.format(new Date(t));
  const todayKey = LOCAL_DATE_KEY_FMT.format(new Date());
  const key = localDateKey(iso);
  if (key === todayKey) return "Today";
  const yesterday = new Date(Date.now() - 86_400_000);
  if (key === LOCAL_DATE_KEY_FMT.format(yesterday)) return `Yesterday, ${fullDate}`;
  return fullDate;
}

function viewChipClass(on: boolean): string {
  return on
    ? "rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy"
    : "rounded-full border border-charcoal/15 bg-white px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy/65";
}

type FeedSubGroup = { label: string; rows: LatestListingRow[] };
type FeedGroup = {
  label: string;
  rows: LatestListingRow[];
  subGroups: FeedSubGroup[] | null;
};

function groupRowsByKey(
  rows: LatestListingRow[],
  keyFor: (row: LatestListingRow) => string,
): { label: string; rows: LatestListingRow[] }[] {
  const groups = new Map<string, LatestListingRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries())
    .map(([label, groupRows]) => ({ label, rows: groupRows }))
    .sort((a, b) => b.rows.length - a.rows.length);
}

function townGroupKey(row: LatestListingRow): string {
  return row.town?.trim() || row.city?.trim() || "Other";
}

function listingsForTown(rows: LatestListingRow[], town: string): LatestListingRow[] {
  const key = town.trim();
  if (!key) return [];
  return rows
    .filter((row) => (row.town?.trim() || row.city?.trim()) === key)
    .sort((a, b) => latestRowActivityMs(b) - latestRowActivityMs(a));
}

function indexOfDay(days: string[], day: string, fallback: number): number {
  const idx = days.indexOf(day);
  return idx >= 0 ? idx : fallback;
}

export default function ClosedClient({
  initialListings = [],
  initialDaily = null,
  initialFrom,
  initialTo,
}: {
  initialListings?: LatestListingRow[];
  initialDaily?: ClosedDailyCachePayload | null;
  initialFrom: string;
  initialTo: string;
}) {
  const days = useMemo(() => closedHorizonDays(), []);
  const defaults = useMemo(() => defaultClosedRange(), []);
  const [startIndex, setStartIndex] = useState(() =>
    indexOfDay(days, initialFrom || defaults.from, Math.max(0, days.length - 30)),
  );
  const [endIndex, setEndIndex] = useState(() =>
    indexOfDay(days, initialTo || defaults.to, days.length - 1),
  );
  const fromDay = days[startIndex] ?? defaults.from;
  const toDay = days[endIndex] ?? defaults.to;

  const [listings, setListings] = useState<LatestListingRow[]>(() =>
    initialListings.filter((row) => isTmreTown(row.town) || isTmreTown(row.city)),
  );
  const [daily, setDaily] = useState<ClosedDailyCachePayload | null>(initialDaily);
  const [loading, setLoading] = useState(initialListings.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [groupByTown, setGroupByTown] = useState(false);
  const [groupByZip, setGroupByZip] = useState(false);
  const [townStatsOpen, setTownStatsOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedTown, setSelectedTown] = useState<string | null>(null);
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [townListings, setTownListings] = useState<LatestListingRow[]>([]);
  const [townLoading, setTownLoading] = useState(false);
  const [townFeedReady, setTownFeedReady] = useState(true);
  const townCacheRef = useRef(new Map<string, LatestListingRow[]>());
  const photoPrefetchCancelRef = useRef<(() => void) | null>(null);
  const dailyRef = useRef(daily);
  dailyRef.current = daily;
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const skipFirstRangeFetch = useRef(initialListings.length > 0);
  const rangeKey = `${fromDay}|${toDay}`;

  const townStats: ClosedTownStat[] = useMemo(
    () => sliceClosedTownStats(daily?.buckets ?? [], fromDay, toDay),
    [daily, fromDay, toDay],
  );

  useEffect(() => {
    if (!groupByTown) setGroupByZip(false);
  }, [groupByTown]);

  const refresh = useCallback(
    async (opts?: { town?: string | null }) => {
      const town = opts?.town ?? null;
      const url = closedExploreFeedUrl(fromDay, toDay, {
        town: town ?? undefined,
        limit: town ? CLOSED_TOWN_EXPAND_LIMIT : CLOSED_FEED_LIMIT,
        buckets: !town && !dailyRef.current,
      });
      const body = await loadTabJson<ClosedApiResponse>(url);
      if (!body) throw new Error("Failed to load closed listings");
      if (body.daily) setDaily(body.daily);
      return (body.listings ?? []).filter(
        (row) => isTmreTown(row.town) || isTmreTown(row.city),
      );
    },
    [fromDay, toDay],
  );

  useEffect(() => {
    if (skipFirstRangeFetch.current) {
      skipFirstRangeFetch.current = false;
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      townCacheRef.current.clear();
      void refresh()
        .then((rows) => {
          if (cancelled) return;
          setListings(rows);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to load");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rangeKey, refresh]);

  useEffect(() => {
    if (!selectedTown) {
      setTownListings([]);
      setTownLoading(false);
      setTownFeedReady(true);
      return;
    }
    const cacheKey = `${rangeKey}|${selectedTown}`;
    const cached = townCacheRef.current.get(cacheKey);
    if (cached) {
      setTownListings(cached);
      setTownLoading(false);
      setTownFeedReady(true);
      return;
    }
    const placeholder = listingsForTown(listingsRef.current, selectedTown);
    setTownListings(placeholder);
    setTownLoading(true);
    setTownFeedReady(false);
    let cancelled = false;
    void refresh({ town: selectedTown })
      .then((rows) => {
        if (cancelled) return;
        townCacheRef.current.set(cacheKey, rows);
        setTownListings(rows);
        setTownFeedReady(true);
      })
      .catch(() => {
        if (!cancelled) setTownFeedReady(true);
      })
      .finally(() => {
        if (!cancelled) setTownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTown, rangeKey, refresh]);

  const visibleListings = useMemo(() => {
    const base = selectedTown ? townListings : listings;
    if (!selectedZip) return base;
    return base.filter((row) => normalizeZip(row.zip) === selectedZip);
  }, [listings, townListings, selectedTown, selectedZip]);

  useEffect(() => {
    if (loading) return;
    void prefetchAllTownSnapshots();
  }, [loading]);

  useEffect(() => {
    prefetchAllTownBoundaries();
  }, []);

  useLayoutEffect(() => {
    if (visibleListings.length === 0) return;
    photoPrefetchCancelRef.current?.();
    const keys = visibleListings
      .map((row) => row.listingKey?.trim() || row.mlsId)
      .filter(Boolean);
    photoPrefetchCancelRef.current = prefetchMlsPhotoThumbsOrdered(keys, {
      stackPhotosForTop: 12,
      stackPhotoCount: 1,
    });
    return () => {
      photoPrefetchCancelRef.current?.();
      photoPrefetchCancelRef.current = null;
    };
  }, [visibleListings]);

  const toggleTownFilter = useCallback((town: string) => {
    setSelectedTown((prev) => (prev === town ? null : town));
    setSelectedZip(null);
  }, []);

  const toggleZipFilter = useCallback((town: string, zip: string) => {
    const normalized = normalizeZip(zip);
    if (!normalized) return;
    setSelectedTown(town);
    setSelectedZip((prev) => (prev === normalized ? null : normalized));
  }, []);

  const toggleGroupCollapsed = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const isGrouped = groupByTown;
  const feedGroups = useMemo((): FeedGroup[] => {
    if (!isGrouped) return [];
    return groupRowsByKey(visibleListings, townGroupKey).map((group) => {
      if (groupByZip && !selectedZip) {
        const subGroups = groupRowsByKey(group.rows, (row) => row.zip?.trim() || "Unknown");
        return { label: group.label, rows: group.rows, subGroups };
      }
      return { label: group.label, rows: group.rows, subGroups: null };
    });
  }, [visibleListings, isGrouped, groupByZip, selectedZip]);

  const addressColumnCh = useMemo(() => {
    const rows = isGrouped ? feedGroups.flatMap((g) => g.rows) : visibleListings;
    let max = 16;
    for (const row of rows) {
      const addr = row.address?.trim() ?? "";
      if (addr.length > max) max = addr.length;
    }
    return Math.min(36, Math.max(16, max + 2));
  }, [feedGroups, isGrouped, visibleListings]);

  const closedCount = selectedTown
    ? townStats.find((row) => row.town === selectedTown)?.updateCount ?? visibleListings.length
    : townStats.reduce((sum, row) => sum + row.updateCount, 0);

  const summary = loading
    ? "Loading closed listings…"
    : selectedTown
      ? `${visibleListings.length} shown · ${closedCount} closed in ${selectedTown}`
      : `${visibleListings.length} shown · ${closedCount} closed in range`;

  const townStatsProps = {
    stats: townStats,
    loading: false,
    selectedTown,
    selectedZip,
    onTownSelect: toggleTownFilter,
    onZipSelect: toggleZipFilter,
    countNoun: "closed",
    countNounPlural: "closed",
    volumeHint: "Towns by closings · lookback",
    latestCaption: "Latest close",
    emptyHint: "No closings in this lookback.",
  };

  const renderRow = (l: LatestListingRow) => (
    <div className="latest-feed-row latest-ticker-row-slot">
      <LatestLineRow
        listing={l}
        isLive
        hideTown={groupByTown || Boolean(selectedTown)}
        hideZip={Boolean(selectedZip)}
        showZipMap={groupByZip && !selectedZip}
        addressColumnCh={addressColumnCh}
        showStatus={false}
        dateOnlyClock
      />
    </div>
  );

  return (
    <>
      <section className="navy-gradient relative overflow-hidden pt-20 pb-0 text-white lg:hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4">
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            Explore
          </p>
          <h1 className="font-serif text-[2rem] leading-[1.05] text-white">
            Closed <span className="italic gold-shimmer">sales.</span>
          </h1>
          <p className="mt-2 text-sm leading-snug text-white/70">
            {TMRE_TOWNS_LABEL}
            {" · "}
            {formatClosedDayLabel(fromDay)} → {formatClosedDayLabel(toDay)}
          </p>
          <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-white/50">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${loading ? "bg-gold animate-pulse-dot" : "bg-sage animate-pulse-dot"}`} />
            <span className="truncate">{summary}</span>
          </div>
          <ExplorePageTabs active="closed" />
        </div>
      </section>

      <section className="navy-gradient relative hidden overflow-hidden pt-28 pb-0 text-white lg:block">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-10">
          <p className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase text-gold animate-fade-up">
            Explore
          </p>
          <h1 className="max-w-3xl font-serif text-6xl leading-[1.05] text-white animate-fade-up">
            Closed <span className="italic gold-shimmer">sales.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 animate-fade-up-delay-1">
            Closed listings across {TMRE_TOWNS_LABEL}. Drag both ends of the
            lookback to set the start and end of the window. Town stats are
            precomputed daily totals — the slider only range-sums them.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs text-white/50 animate-fade-up-delay-2">
            <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-gold animate-pulse-dot" : "bg-sage animate-pulse-dot"}`} />
            <span>{summary}</span>
          </div>
          <ExplorePageTabs active="closed" />
        </div>
      </section>

      <section className="bg-cream pt-3 pb-12 lg:pt-5 lg:pb-14">
        <div className="mx-auto max-w-7xl space-y-3 px-3 sm:px-6 lg:px-10">
          <ClosedLookbackRangeSlider
            days={days}
            startIndex={startIndex}
            endIndex={endIndex}
            onStartChange={setStartIndex}
            onEndChange={setEndIndex}
          />

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start lg:gap-5">
            <div className="min-w-0">
              <div className="mb-3 space-y-2.5 lg:mb-2.5 lg:space-y-0">
                <div className="flex items-center justify-between gap-3 font-mono text-[11px] tracking-[0.12em] uppercase">
                  <span className="hidden text-charcoal/45 lg:inline">
                    {groupByTown ? "Grouped by town" : "By close date"}
                  </span>
                  <div className="ml-auto flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1.5 text-navy/65 transition-colors hover:text-navy lg:hidden"
                      onClick={() => setTownStatsOpen(true)}
                    >
                      Town stats
                    </button>
                    {selectedTown ? (
                      <button
                        type="button"
                        onClick={() => toggleTownFilter(selectedTown)}
                        className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold lg:inline"
                      >
                        Clear town
                      </button>
                    ) : null}
                    {selectedZip ? (
                      <button
                        type="button"
                        onClick={() => setSelectedZip(null)}
                        className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold lg:inline"
                      >
                        Clear zip
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setGroupByTown((v) => !v)}
                      className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold lg:inline"
                    >
                      {groupByTown ? "Sort by close date" : "Group by town"}
                    </button>
                    {groupByTown ? (
                      <button
                        type="button"
                        onClick={() => setGroupByZip((v) => !v)}
                        className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold lg:inline"
                      >
                        {groupByZip ? "Ungroup zip" : "Group by zip"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 lg:hidden">
                  <button type="button" className={viewChipClass(groupByTown)} onClick={() => setGroupByTown(true)}>
                    By town
                  </button>
                  <button type="button" className={viewChipClass(!groupByTown)} onClick={() => setGroupByTown(false)}>
                    By time
                  </button>
                  {groupByTown ? (
                    <button type="button" className={viewChipClass(groupByZip)} onClick={() => setGroupByZip((v) => !v)}>
                      Zip
                    </button>
                  ) : null}
                  {selectedTown ? (
                    <button
                      type="button"
                      className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy"
                      onClick={() => toggleTownFilter(selectedTown)}
                    >
                      Clear town
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] lg:rounded-2xl">
                {loading || (selectedTown && !townFeedReady && visibleListings.length === 0) ? (
                  <div className="px-5 py-16 text-center text-slate">
                    <span className="inline-flex items-center gap-2 font-mono text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-dot" />
                      {selectedTown ? `Loading ${selectedTown} closings…` : "Pulling closed listings…"}
                    </span>
                  </div>
                ) : error ? (
                  <div className="px-5 py-16 text-center text-sm text-slate">{error}</div>
                ) : visibleListings.length === 0 ? (
                  <div className="px-5 py-16 text-center text-sm text-slate">
                    {selectedTown
                      ? `No closings in ${selectedTown} for this lookback.`
                      : "No closings in this lookback."}
                  </div>
                ) : isGrouped ? (
                  feedGroups.map((group) => {
                    const collapsed = collapsedGroups.has(group.label);
                    const renderScrollRow = (l: LatestListingRow, dup: "a" | "b") => (
                      <div key={`${l.key}-${dup}`}>{renderRow(l)}</div>
                    );
                    const renderNested = (): ReactNode => {
                      if (!group.subGroups) {
                        return (
                          <LatestSmoothScrollList
                            enabled={!selectedTown}
                            rows={group.rows}
                            renderRow={renderScrollRow}
                            phaseKey={group.label}
                          />
                        );
                      }
                      return group.subGroups.map((sub) => {
                        const subZip = normalizeZip(sub.label);
                        return (
                          <div key={`${group.label}::${sub.label}`}>
                            <div className="flex items-center gap-2 border-b border-charcoal/[0.06] bg-cream/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/45 sm:px-4">
                              {subZip ? (
                                <LatestZipMapHover
                                  zip={subZip}
                                  townName={group.label}
                                  className="font-semibold text-navy/55"
                                />
                              ) : (
                                <span className="font-semibold text-navy/55">{sub.label}</span>
                              )}
                              <span className="tabular-nums text-charcoal/35">{sub.rows.length}</span>
                            </div>
                            <LatestSmoothScrollList
                              enabled={!selectedTown}
                              rows={sub.rows}
                              renderRow={renderScrollRow}
                              phaseKey={`${group.label}::${sub.label}`}
                            />
                          </div>
                        );
                      });
                    };
                    return (
                      <div key={group.label}>
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-y border-charcoal/[0.08] bg-cream/95 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-charcoal/55 backdrop-blur-sm sm:px-4">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapsed(group.label)}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                            {selectedTown ? null : (
                              <LatestTownMapHover
                                townName={group.label}
                                className="truncate font-semibold text-navy/80"
                              />
                            )}
                          </button>
                          <span className="tabular-nums">{group.rows.length}</span>
                        </div>
                        {!collapsed ? renderNested() : null}
                      </div>
                    );
                  })
                ) : (
                  visibleListings.map((l, i) => {
                    const activityIso = latestRowActivityIso(l);
                    const key = localDateKey(activityIso);
                    const prevKey =
                      i > 0 ? localDateKey(latestRowActivityIso(visibleListings[i - 1])) : null;
                    return (
                      <div key={l.key}>
                        {key !== prevKey ? (
                          <div className="flex w-full items-center gap-2 border-b border-charcoal/[0.08] bg-cream/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-charcoal/55 sm:px-4">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
                            <span className="font-semibold text-navy/70">
                              {localDateLabel(activityIso)}
                            </span>
                          </div>
                        ) : null}
                        {renderRow(l)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <LatestTownStats className="hidden lg:block" {...townStatsProps} />
          </div>
        </div>
      </section>

      <IntelTownStatsDrawer
        open={townStatsOpen}
        onClose={() => setTownStatsOpen(false)}
        title="Town stats"
        ariaLabel="Town stats"
      >
        <LatestTownStats
          showHeading={false}
          {...townStatsProps}
          onTownSelect={(town) => {
            toggleTownFilter(town);
            setTownStatsOpen(false);
          }}
          onZipSelect={(town, zip) => {
            toggleZipFilter(town, zip);
            setTownStatsOpen(false);
          }}
        />
      </IntelTownStatsDrawer>
    </>
  );
}
