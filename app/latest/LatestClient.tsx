"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import IntelTownStatsDrawer from "@/components/intelligence/IntelTownStatsDrawer";
import { formatStatusBadgeLabel } from "@/components/intelligence/deal-board/deal-board-shared";
import FeedCollapseSign from "@/components/latest/FeedCollapseSign";
import FeedDayGroupHeader from "@/components/latest/FeedDayGroupHeader";
import LatestLineRow from "@/components/latest/LatestLineRow";
import LatestSearchAlertForm from "@/components/latest/LatestSearchAlertForm";
import LatestSmoothScrollList from "@/components/latest/LatestSmoothScrollList";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";
import LatestTownStats from "@/components/latest/LatestTownStats";
import ExplorePageTabs from "@/components/explore/ExplorePageTabs";
import { prefetchAllTownSnapshots } from "@/components/latest/LatestIntelligenceTownSnapshot";
import { prefetchAllTownBoundaries } from "@/components/ZipBoundaryPopover";
import type { LatestListingRow, TownUpdateStat } from "@/lib/latest-listings";
import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { prefetchMlsPhotoThumbsOrdered } from "@/lib/prefetch-listing-images";
import {
  latestRowActivityIso,
  latestRowActivityMs,
} from "@/lib/latest-activity";
import { groupRowsByDay } from "@/lib/latest-day-groups";
import {
  ensureMinOneListingPerTmreTown,
  feedCoversAllTmreTowns,
} from "@/lib/latest-town-coverage";
import {
  patchLatestViewScrollY,
  readLatestViewState,
  writeLatestViewState,
} from "@/lib/latest-view-state";
import {
  isTmreTown,
  normalizeZip,
  townHasMultipleZips,
} from "@/lib/tmre-towns";
import { evaluateIncrementalHealth } from "@/lib/incremental-sync-health";
import { latestExploreFeedUrl } from "@/lib/explore-tab-prefetch";
import { loadTabJson } from "@/lib/tab-data-prefetch";
import { useCoverageTowns } from "@/components/CoverageTownsProvider";

type ApiResponse = {
  listings: LatestListingRow[];
  count: number;
  townStats: TownUpdateStat[];
  since: string | null;
  lastIncrementalSync: string | null;
  lastMlsSyncHeartbeat?: string | null;
  lastFullSync: string | null;
  generatedAt: string;
};

const LATEST_LIMIT = 30;
// When a town is selected in the stats sidebar, expand that town's feed to show
// up to this many of its most recently updated listings (vs. its slice of the
// global 30). Deselecting reverts to the town's share of the global feed.
const TOWN_EXPAND_LIMIT = 30;
// In grouped view, the first N town groups can expand beyond the global 30-on-30
// share via backfill. Always show that town's global-feed rows; "Show more"
// only reveals backfilled extras (never hide part of the 30).
const TOP_TOWN_COUNT = 3;
const TOP_TOWN_FETCH_LIMIT = 25;
const POLL_MS = LATEST_DB_REFRESH_MS;
const LATEST_REFRESH_MINUTES = LATEST_DB_REFRESH_MS / 60_000;

const STATUS_SUMMARY_ORDER: LatestListingRow["status"][] = [
  "Coming Soon",
  "New",
  "Back on Market",
  "Reduced",
  "Increased",
];

/** Session key for status pills when sorting by latest timestamp (not by town). */
const BY_TIME_STATUS_KEY = "__by_time__";

const STATUS_PILL_CLASS: Record<LatestListingRow["status"], string> = {
  New: "bg-sage/10 text-sage border-sage/30",
  Reduced: "bg-coral/10 text-coral border-coral/30",
  Increased: "bg-sky/10 text-sky border-sky/30",
  "Coming Soon": "bg-gold/10 text-gold border-gold/30",
  "Back on Market": "bg-navy/10 text-navy border-navy/30",
};

/** Status filter pills — mobile ~50% larger than the old 7px/px-1 size; desktop unchanged. */
const STATUS_FILTER_PILL_LAYOUT =
  "inline-flex items-center gap-[3px] rounded-full border px-1.5 py-[1.5px] font-mono text-[10.5px] tracking-[0.12em] uppercase transition-colors hover:opacity-90 lg:gap-1 lg:px-2 lg:py-0.5 lg:text-[11px]";

function summarizeTownStatuses(
  rows: LatestListingRow[],
): { status: LatestListingRow["status"]; count: number }[] {
  const counts = new Map<LatestListingRow["status"], number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return STATUS_SUMMARY_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map(
    (status) => ({ status, count: counts.get(status) ?? 0 }),
  );
}

function pickListingRow(
  a: LatestListingRow,
  b: LatestListingRow,
): LatestListingRow {
  const aMs = latestRowActivityMs(a);
  const bMs = latestRowActivityMs(b);
  const newer = bMs > aMs ? b : a;
  const older = bMs > aMs ? a : b;
  // Poll rows often arrive before Goldilocks is persisted — keep the better
  // score/breakdown so a fresh 0.0 does not wipe a warm cache score.
  const newerScore = Number(newer.score) || 0;
  const olderScore = Number(older.score) || 0;
  const score =
    newerScore > 0 && newerScore >= olderScore
      ? newerScore
      : olderScore > 0
        ? olderScore
        : newerScore;
  const scoreBreakdown =
    (newerScore > 0 && newer.scoreBreakdown) ||
    older.scoreBreakdown ||
    newer.scoreBreakdown ||
    null;
  return {
    ...newer,
    score,
    scoreBreakdown,
    priceChange: newer.priceChange ?? older.priceChange ?? null,
    town: newer.town?.trim() || older.town?.trim() || newer.city || older.city || null,
    city: newer.city?.trim() || older.city?.trim() || null,
  };
}

function mergeListings(
  current: LatestListingRow[],
  incoming: LatestListingRow[],
): LatestListingRow[] {
  const byKey = new Map<string, LatestListingRow>();
  for (const row of [...incoming, ...current]) {
    if (!row.key) continue;
    const existing = byKey.get(row.key);
    byKey.set(row.key, existing ? pickListingRow(existing, row) : row);
  }
  return ensureMinOneListingPerTmreTown(Array.from(byKey.values()), LATEST_LIMIT);
}

function newestModification(listings: LatestListingRow[]): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const row of listings) {
    const iso = latestRowActivityIso(row);
    const t = latestRowActivityMs(row);
    if (!Number.isNaN(t) && t > bestMs) {
      bestMs = t;
      best = iso;
    }
  }
  return best;
}

// Formatters use the viewer's local timezone (no explicit timeZone option).
const LOCAL_SYNC_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatSync(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return LOCAL_SYNC_FMT.format(new Date(t));
}

type FeedSubGroup = {
  label: string;
  rows: LatestListingRow[];
};

type FeedGroup = {
  label: string;
  rows: LatestListingRow[];
  isTop: boolean;
  /** How many rows came from the global 30-on-30 feed (before town backfill). */
  globalCount: number;
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

function zipGroupKey(row: LatestListingRow): string {
  return row.zip?.trim() || "Unknown";
}

/** Rows from the global feed that belong to a town (instant placeholder while town feed loads). */
function listingsForTown(
  rows: LatestListingRow[],
  town: string,
): LatestListingRow[] {
  const key = town.trim();
  if (!key) return [];
  return rows
    .filter((row) => (row.town?.trim() || row.city?.trim()) === key)
    .sort((a, b) => latestRowActivityMs(b) - latestRowActivityMs(a));
}

type LatestClientProps = {
  /** Pre-warmed global ticker from server (max 30). */
  initialListings?: LatestListingRow[];
  /** Pre-warmed per-town feeds from server (~7 × 30 in background). */
  initialTownFeeds?: Record<string, LatestListingRow[]>;
  initialTownStats?: TownUpdateStat[];
};

function seedTownCache(
  feeds?: Record<string, LatestListingRow[]>,
): Map<string, LatestListingRow[]> {
  const map = new Map<string, LatestListingRow[]>();
  if (!feeds) return map;
  for (const [town, rows] of Object.entries(feeds)) {
    if (rows.length > 0) map.set(town, rows);
  }
  return map;
}

export default function LatestClient({
  initialListings = [],
  initialTownFeeds = {},
  initialTownStats = [],
}: LatestClientProps) {
  const { townsLabel } = useCoverageTowns();
  const [listings, setListings] = useState<LatestListingRow[]>(() =>
    ensureMinOneListingPerTmreTown(
      initialListings.filter(
        (row) => isTmreTown(row.town) || isTmreTown(row.city),
      ),
      LATEST_LIMIT,
    ),
  );
  const [townStats, setTownStats] = useState<TownUpdateStat[]>(initialTownStats);
  const [loading, setLoading] = useState(initialListings.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  /** Default: chronological (by time). Group-by-town is opt-in. */
  const [groupByTown, setGroupByTown] = useState(false);
  const [groupByZip, setGroupByZip] = useState(false);
  const [townStatsOpen, setTownStatsOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  /**
   * False means "nobody has opened or closed anything yet", which reads as every
   * group closed. Latest opens as a summary — day and town headers with counts —
   * so a week of listings is a page you scan rather than one you scroll.
   *
   * This is a flag rather than a pre-filled `collapsedGroups`, because the keys
   * come from the feed and the feed arrives after first paint. Seeding the set
   * from an effect would mean a frame of everything open, and a setState inside
   * an effect on every refresh.
   */
  const [collapseTouched, setCollapseTouched] = useState(false);
  const [selectedTown, setSelectedTown] = useState<string | null>(null);
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [townListings, setTownListings] = useState<LatestListingRow[]>([]);
  const [townLoading, setTownLoading] = useState(false);
  /** True only after a town feed fetch finished (or cache hit). Prevents empty-state flash. */
  const [townFeedReady, setTownFeedReady] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  /** Per-group status filter from group-header pills (null / missing = all). */
  const [groupStatusFilter, setGroupStatusFilter] = useState<
    Partial<Record<string, LatestListingRow["status"]>>
  >({});
  const [topTownBackfill, setTopTownBackfill] = useState<Record<string, LatestListingRow[]>>({});
  /** False until session view (if any) has been applied — avoids writing defaults over it. */
  const [viewHydrated, setViewHydrated] = useState(false);
  const watermarkRef = useRef<string | null>(
    initialListings.length > 0 ? newestModification(initialListings) : null,
  );
  const visibleRef = useRef(true);
  // Client cache of each town's expanded feed so re-selecting is instant. Server
  // prebuilds the same feeds during the 30-minute DB refresh so first
  // clicks should stay on SQLite instead of live scoring / RETS.
  const townCacheRef = useRef(seedTownCache(initialTownFeeds));
  const townInFlightRef = useRef<Map<string, Promise<LatestListingRow[]>>>(new Map());
  const photoPrefetchCancelRef = useRef<(() => void) | null>(null);
  const pendingScrollY = useRef(0);

  useEffect(() => {
    if (!groupByTown) setGroupByZip(false);
  }, [groupByTown]);

  // Restore grouping / filters after listing Back (soft remount). Skip on hard
  // refresh — sessionStorage survives reload and was re-applying a town filter
  // (often Westport) after SSR painted the full multi-town ticker.
  useLayoutEffect(() => {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    const isReload = nav?.type === "reload";
    if (!isReload) {
      const stored = readLatestViewState();
      if (stored) {
        setGroupByTown(stored.groupByTown);
        setGroupByZip(stored.groupByZip);
        setTownStatsOpen(stored.townStatsOpen);
        setSelectedTown(stored.selectedTown);
        setSelectedZip(stored.selectedZip);
        setCollapsedGroups(new Set(stored.collapsedGroups));
        setCollapseTouched(stored.collapseTouched);
        setExpandedGroups(new Set(stored.expandedGroups));
        setGroupStatusFilter(stored.groupStatusFilter);
        pendingScrollY.current = stored.scrollY;
      }
    }
    setViewHydrated(true);
  }, []);

  // Scroll restore waits until the feed has painted (height exists to scroll into).
  useLayoutEffect(() => {
    const y = pendingScrollY.current;
    if (!viewHydrated || y < 1) return;
    if (loading) return;
    if (selectedTown && townLoading && townListings.length === 0) return;

    const restore = () =>
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
    restore();
    const raf = window.requestAnimationFrame(restore);
    const t0 = window.setTimeout(restore, 0);
    const t1 = window.setTimeout(() => {
      restore();
      // Stop retrying once the page is tall enough (or we gave it a beat).
      if (document.documentElement.scrollHeight >= y + window.innerHeight * 0.5) {
        pendingScrollY.current = 0;
      }
    }, 180);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [viewHydrated, loading, selectedTown, townLoading, townListings.length, groupByTown]);

  useEffect(() => {
    if (!viewHydrated) return;
    writeLatestViewState({
      groupByTown,
      groupByZip: groupByTown && groupByZip,
      selectedTown,
      selectedZip,
      townStatsOpen,
      collapsedGroups: [...collapsedGroups],
      collapseTouched,
      expandedGroups: [...expandedGroups],
      groupStatusFilter,
      scrollY:
        typeof window !== "undefined"
          ? window.scrollY || window.pageYOffset || 0
          : 0,
    });
  }, [
    viewHydrated,
    groupByTown,
    groupByZip,
    selectedTown,
    selectedZip,
    townStatsOpen,
    collapsedGroups,
    collapseTouched,
    expandedGroups,
    groupStatusFilter,
  ]);

  useEffect(() => {
    if (!viewHydrated) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        patchLatestViewScrollY(window.scrollY || window.pageYOffset || 0);
      });
    };
    const flush = () => {
      patchLatestViewScrollY(window.scrollY || window.pageYOffset || 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [viewHydrated]);

  const fetchAllTownFeeds = useCallback(async (): Promise<void> => {
    const body = await loadTabJson<{
      towns?: Record<string, LatestListingRow[]>;
    }>("/api/listings/latest/towns");
    if (!body) return;
    for (const [town, rows] of Object.entries(body.towns ?? {})) {
      if (Array.isArray(rows) && rows.length > 0) {
        townCacheRef.current.set(town, rows);
      }
    }
  }, []);

  const fetchTownListings = useCallback(async (town: string): Promise<LatestListingRow[]> => {
    const cached = townCacheRef.current.get(town);
    if (cached) return cached;
    const existing = townInFlightRef.current.get(town);
    if (existing) return existing;

    const params = new URLSearchParams();
    params.set("limit", String(TOWN_EXPAND_LIMIT));
    params.set("town", town);
    const promise = fetch(`/api/listings/latest?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        const rows = body.listings ?? [];
        if (rows.length > 0) townCacheRef.current.set(town, rows);
        return rows;
      })
      .finally(() => {
        townInFlightRef.current.delete(town);
      });
    townInFlightRef.current.set(town, promise);
    return promise;
  }, []);

  const refresh = useCallback(async (options: { since?: string | null } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(LATEST_LIMIT));
    if (options.since) params.set("since", options.since);
    const url = options.since
      ? `/api/listings/latest?${params.toString()}`
      : latestExploreFeedUrl();

    const body = await loadTabJson<ApiResponse>(url, {
      force: Boolean(options.since),
    });
    if (!body) throw new Error("Failed to load latest listings");
    // Never fall back to lastFullSync — that hid a broken End as "Jul 12".
    setLastSync(body.lastIncrementalSync ?? null);
    setLastHeartbeat(body.lastMlsSyncHeartbeat ?? null);
    setTownStats(body.townStats ?? []);

    if (options.since) {
      const freshKeys = new Set(body.listings.map((l) => l.key));
      if (freshKeys.size > 0) {
        // New rows arrived — invalidate warmed town caches so they re-fetch.
        townCacheRef.current.clear();
        void fetchAllTownFeeds();
        setNewKeys((prev) => new Set([...prev, ...freshKeys]));
        setTimeout(() => {
          setNewKeys((prev) => {
            const next = new Set(prev);
            for (const key of freshKeys) next.delete(key);
            return next;
          });
        }, 8000);
      }
      const tmreOnly = body.listings.filter(
        (row) => isTmreTown(row.town) || isTmreTown(row.city),
      );
      setListings((current) => {
        const merged = mergeListings(current, tmreOnly);
        watermarkRef.current = newestModification(merged);
        return merged;
      });
    } else {
      const capped = ensureMinOneListingPerTmreTown(
        body.listings.filter(
          (row) => isTmreTown(row.town) || isTmreTown(row.city),
        ),
        LATEST_LIMIT,
      );
      // Keep SSR / prior multi-town ticker if the API returned a partial mix
      // (stale incomplete global cache) so refresh does not collapse to one town.
      setListings((current) => {
        if (
          current.length > 0 &&
          feedCoversAllTmreTowns(current) &&
          !feedCoversAllTmreTowns(capped)
        ) {
          return current;
        }
        watermarkRef.current = newestModification(capped);
        return capped;
      });
    }
  }, [fetchAllTownFeeds]);

  useEffect(() => {
    const onVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Background warm: one request loads all ~210 town listings into client cache.
    void fetchAllTownFeeds();
    return () => {
      cancelled = true;
    };
  }, [refresh, fetchAllTownFeeds]);

  useEffect(() => {
    // Read-only DB poll — new rows arrive from the background 30-minute sync.
    const poll = setInterval(() => {
      if (!visibleRef.current) return;
      void refresh({ since: watermarkRef.current ?? undefined }).catch(() => {});
    }, POLL_MS);

    return () => {
      clearInterval(poll);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedTown) {
      setTownListings([]);
      setTownLoading(false);
      setTownFeedReady(true);
      return;
    }
    let cancelled = false;
    const cached = townCacheRef.current.get(selectedTown);
    if (cached && cached.length > 0) {
      setTownListings(cached);
      setTownLoading(false);
      setTownFeedReady(true);
      return;
    }
    const placeholder = listingsForTown(listings, selectedTown);
    setTownListings(placeholder);
    setTownLoading(true);
    setTownFeedReady(false);
    void fetchTownListings(selectedTown)
      .then((rows) => {
        if (!cancelled) {
          setTownListings(rows);
          setTownFeedReady(true);
        }
      })
      .catch(() => {
        if (!cancelled && placeholder.length === 0) setTownListings([]);
        if (!cancelled) setTownFeedReady(true);
      })
      .finally(() => {
        if (!cancelled) setTownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTown, fetchTownListings, listings]);

  const visibleListings = useMemo(() => {
    const source = selectedTown ? townListings : listings;
    return source
      .filter((row) => isTmreTown(row.town) || isTmreTown(row.city))
      .filter((row) => !selectedZip || normalizeZip(row.zip) === selectedZip)
      .sort((a, b) => latestRowActivityMs(b) - latestRowActivityMs(a));
  }, [listings, selectedTown, selectedZip, townListings]);

  const byTimeStatusCounts = useMemo(
    () => summarizeTownStatuses(visibleListings),
    [visibleListings],
  );
  const byTimeActiveStatus = groupStatusFilter[BY_TIME_STATUS_KEY] ?? null;
  const byTimeFilteredListings = useMemo(() => {
    if (!byTimeActiveStatus) return visibleListings;
    return visibleListings.filter((row) => row.status === byTimeActiveStatus);
  }, [visibleListings, byTimeActiveStatus]);
  /** Today / Yesterday / older buckets so the ungrouped feed can be skipped. */
  const byTimeDayGroups = useMemo(
    () => groupRowsByDay(byTimeFilteredListings),
    [byTimeFilteredListings],
  );

  // Preload all town market snapshots from SQLite so sidebar clicks are instant.
  useEffect(() => {
    if (loading) return;
    void prefetchAllTownSnapshots();
  }, [loading]);

  useEffect(() => {
    prefetchAllTownBoundaries();
  }, []);

  // Warm hero thumbnails before paint when the feed is hydrated from SSR cache.
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

  const summary = useMemo(() => {
    if (loading) return "Loading recent MLS updates…";
    if (selectedTown) {
      if (townLoading) return `Loading ${selectedTown} updates…`;
      return `${visibleListings.length} updates in ${selectedTown} · newest first`;
    }
    if (listings.length === 0) return "No recent updates in the local database yet.";
    return `${listings.length} most recently updated · live feed`;
  }, [loading, listings, selectedTown, townLoading, visibleListings]);

  const syncLabel = formatSync(lastSync);
  const newestMlsLabel = formatSync(newestModification(visibleListings));
  const pullHealth = evaluateIncrementalHealth({
    host: lastHeartbeat ? "runner" : "netlify",
    heartbeatAt: lastHeartbeat,
    finishedAt: lastSync,
  });

  const isGrouped = groupByTown;

  const feedGroups = useMemo((): FeedGroup[] => {
    if (!isGrouped) return [];

    const townGroups = groupRowsByKey(visibleListings, townGroupKey);
    return townGroups.map((group, idx) => {
      const isTop = !selectedTown && idx < TOP_TOWN_COUNT;
      const globalCount = group.rows.length;
      const backfill = isTop ? topTownBackfill[group.label] : undefined;
      const base =
        backfill && backfill.length > group.rows.length ? backfill : group.rows;
      if (groupByZip && !selectedZip) {
        const subGroups: FeedSubGroup[] = groupRowsByKey(base, zipGroupKey).map(
          (sub) => ({
            label: sub.label,
            rows: sub.rows,
          }),
        );
        return {
          label: group.label,
          rows: subGroups.flatMap((s) => s.rows),
          isTop,
          globalCount,
          subGroups,
        };
      }
      return {
        label: group.label,
        rows: base,
        isTop,
        globalCount,
        subGroups: null,
      };
    });
  }, [
    visibleListings,
    groupByTown,
    groupByZip,
    isGrouped,
    selectedTown,
    selectedZip,
    topTownBackfill,
  ]);

  /** Fixed address column width from longest address (+ zip) in the visible feed. */
  const addressColumnCh = useMemo(() => {
    const rows = isGrouped
      ? feedGroups.flatMap((g) => g.rows)
      : visibleListings;
    let max = 16;
    for (const row of rows) {
      const addr = row.address?.trim() ?? "";
      const zip = row.zip?.trim() ?? "";
      const n = addr.length + (zip ? zip.length + 1 : 0);
      if (n > max) max = n;
    }
    // Cap so one runaway address does not crush price/specs on narrow screens.
    return Math.min(Math.max(max + 1, 16), 48);
  }, [isGrouped, feedGroups, visibleListings]);

  // Top town groups: pull a wider town feed so "Show more" has extras beyond
  // that town's share of the global 30.
  const topTownsNeedingBackfill = useMemo(() => {
    if (selectedTown || !groupByTown) return [];
    return feedGroups
      .slice(0, TOP_TOWN_COUNT)
      .filter(
        (g) => (topTownBackfill[g.label]?.length ?? 0) < TOP_TOWN_FETCH_LIMIT,
      )
      .map((g) => g.label);
  }, [feedGroups, selectedTown, topTownBackfill, groupByTown]);

  const applyTownSelection = useCallback(
    (town: string | null) => {
      if (!town) {
        setSelectedTown(null);
        setSelectedZip(null);
        setTownListings([]);
        setTownLoading(false);
        setTownFeedReady(true);
        return;
      }
      setSelectedTown(town);
      const cached = townCacheRef.current.get(town);
      if (cached && cached.length > 0) {
        setTownListings(cached);
        setTownLoading(false);
        setTownFeedReady(true);
        return;
      }
      const placeholder = listingsForTown(listings, town);
      setTownListings(placeholder);
      setTownLoading(true);
      setTownFeedReady(false);
    },
    [listings],
  );

  const toggleTownFilter = useCallback(
    (town: string) => {
      if (selectedTown === town) {
        applyTownSelection(null);
        return;
      }
      setSelectedZip(null);
      applyTownSelection(town);
    },
    [applyTownSelection, selectedTown],
  );

  const toggleZipFilter = useCallback(
    (town: string, zip: string) => {
      const normalized = normalizeZip(zip);
      if (!normalized) return;
      if (selectedTown === town && selectedZip === normalized) {
        setSelectedZip(null);
        return;
      }
      if (selectedTown !== town) applyTownSelection(town);
      setSelectedZip(normalized);
    },
    [applyTownSelection, selectedTown, selectedZip],
  );

  /** Keys of every group currently on screen, in whichever mode is active. */
  const currentGroupKeys = useMemo(
    () =>
      groupByTown
        ? feedGroups.map((group) => group.label)
        : byTimeDayGroups.map((day) => day.collapseKey),
    [groupByTown, feedGroups, byTimeDayGroups],
  );

  const groupIsCollapsed = useCallback(
    (label: string) => (collapseTouched ? collapsedGroups.has(label) : true),
    [collapseTouched, collapsedGroups],
  );

  const toggleGroupCollapsed = useCallback(
    (label: string) => {
      // The first click has to write down what the default was implying,
      // otherwise opening one day would open all of them.
      if (!collapseTouched) {
        setCollapsedGroups(
          new Set(currentGroupKeys.filter((key) => key !== label)),
        );
        setCollapseTouched(true);
        return;
      }
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
    },
    [collapseTouched, currentGroupKeys],
  );

  const toggleGroupExpanded = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const toggleGroupStatusFilter = useCallback(
    (label: string, status: LatestListingRow["status"]) => {
      setGroupStatusFilter((prev) => {
        if (prev[label] === status) {
          const next = { ...prev };
          delete next[label];
          return next;
        }
        return { ...prev, [label]: status };
      });
      // Filtering a group is asking to look inside it, so open it either way.
      if (!collapseTouched) {
        setCollapsedGroups(
          new Set(currentGroupKeys.filter((key) => key !== label)),
        );
        setCollapseTouched(true);
        return;
      }
      setCollapsedGroups((prev) => {
        if (!prev.has(label)) return prev;
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    },
    [collapseTouched, currentGroupKeys],
  );

  const resetGroupUi = useCallback(() => {
    setCollapsedGroups(new Set());
    // Back to the closed summary — switching between by-time and by-town is a
    // new way of looking at the feed, not a continuation of the old one.
    setCollapseTouched(false);
    setExpandedGroups(new Set());
    setGroupStatusFilter({});
  }, []);

  const activateGroupByTown = useCallback(() => {
    setGroupByTown((v) => {
      if (v) setGroupByZip(false);
      return !v;
    });
    resetGroupUi();
  }, [resetGroupUi]);

  const activateGroupByZip = useCallback(() => {
    setGroupByZip((v) => !v);
    resetGroupUi();
  }, [resetGroupUi]);

  const backfillKey = topTownsNeedingBackfill.join("|");
  useEffect(() => {
    if (!backfillKey) return;
    const towns = backfillKey.split("|");
    let cancelled = false;
    void Promise.all(
      towns.map(async (town) => {
        const params = new URLSearchParams();
        params.set("limit", String(TOP_TOWN_FETCH_LIMIT));
        params.set("town", town);
        try {
          const res = await fetch(`/api/listings/latest?${params.toString()}`, {
            cache: "no-store",
          });
          if (!res.ok) return [town, [] as LatestListingRow[]] as const;
          const body = (await res.json()) as ApiResponse;
          return [town, body.listings ?? []] as const;
        } catch {
          return [town, [] as LatestListingRow[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setTopTownBackfill((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [backfillKey]);

  const modeLabel =
    groupByTown && groupByZip
      ? "Grouped By Town · Zip"
      : groupByTown
        ? "Grouped By Town"
        : "By Updated Timestamp";

  const viewChipClass = (active: boolean) =>
    `rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
      active
        ? "border-navy bg-navy text-white"
        : "border-charcoal/20 bg-white text-navy/75"
    }`;

  return (
    <>
      {/* —— Mobile hero (phone / narrow) —— */}
      <section className="navy-gradient relative overflow-hidden pt-[4.5rem] pb-0 text-white lg:hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4">
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            Explore
          </p>
          <h1 className="font-serif text-[2rem] leading-[1.05] text-white">
            Latest <span className="italic gold-shimmer">updates.</span>
          </h1>
          <p className="mt-2 text-sm leading-snug text-white/70">
            <span className="font-medium text-gold">30 on 30</span>
            {" · "}
            {townsLabel}
            {" · live every "}
            {LATEST_REFRESH_MINUTES}m
          </p>
          <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-white/50">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                loading ? "bg-gold animate-pulse-dot" : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="truncate">{summary}</span>
          </div>
          <ExplorePageTabs active="latest" />
        </div>
      </section>

      {/* —— Desktop hero —— */}
      <section className="navy-gradient relative hidden overflow-hidden pt-28 pb-0 text-white lg:block">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-10">
          <p className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase text-gold animate-fade-up">
            Explore
          </p>
          <h1 className="max-w-3xl font-serif text-6xl leading-[1.05] text-white animate-fade-up">
            Latest{" "}
            <span className="italic gold-shimmer">updates.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 animate-fade-up-delay-1">
            <span className="font-medium text-gold">30 on 30</span> — the{" "}
            {LATEST_LIMIT} most recently updated active listings across {townsLabel}
            {" "}(last-24h MLS updates and new listings first), refreshed every{" "}
            {LATEST_REFRESH_MINUTES} minutes — live without reloading the page.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs animate-fade-up-delay-2">
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  loading ? "bg-gold animate-pulse-dot" : "bg-sage animate-pulse-dot"
                }`}
              />
              <span className="text-white/50">{summary}</span>
            </span>
            {newestMlsLabel ? (
              <span
                className="tracking-[0.08em] uppercase text-white/40"
                title="Newest event clock among listings in this feed (price/status/list — not ModificationTimestamp-only bumps)"
              >
                Newest MLS update {newestMlsLabel}
              </span>
            ) : null}
            <span
              className={`tracking-[0.08em] uppercase ${
                pullHealth.inventory === "missing"
                  ? "text-coral/90"
                  : pullHealth.inventory === "stale"
                    ? "text-gold/80"
                    : "text-white/35"
              }`}
              title={
                pullHealth.inventory === "missing"
                  ? "last_incremental_sync is missing — Incremental End never stamped; feed may be stale"
                  : pullHealth.inventory === "stale"
                    ? "Last Incremental End is older than ~70 minutes — inventory may be behind"
                    : "When the last Incremental RETS pull finished (last_incremental_sync)"
              }
            >
              {pullHealth.inventory === "missing"
                ? "Last pull MISSING"
                : pullHealth.inventory === "stale"
                  ? `Last pull ${syncLabel} · stale`
                  : `Last pull ${syncLabel}`}
            </span>
          </div>
          <ExplorePageTabs active="latest" />
        </div>
      </section>

      <section className="bg-cream pt-3 pb-12 lg:pt-5 lg:pb-14">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start lg:gap-5">
            <div className="min-w-0">
              <div className="mb-3 space-y-2.5 lg:mb-2.5 lg:space-y-0">
                <div className="flex items-center justify-between gap-3 font-mono text-[11px] tracking-[0.12em] uppercase">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="hidden text-charcoal/45 lg:inline">
                      {modeLabel}
                    </span>
                    <LatestSearchAlertForm />
                  </div>
                  <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1.5 text-navy/65 transition-colors hover:text-navy lg:hidden"
                      onClick={() => setTownStatsOpen(true)}
                      aria-expanded={townStatsOpen}
                      aria-controls="latest-town-stats-drawer"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5 shrink-0"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
                      </svg>
                      <span className="underline decoration-navy/35 underline-offset-2">
                        Town stats
                        {selectedTown ? " · on" : ""}
                      </span>
                    </button>
                    {selectedTown ? (
                      <button
                        type="button"
                        onClick={() => toggleTownFilter(selectedTown)}
                        className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50 lg:inline"
                      >
                        Clear town
                      </button>
                    ) : null}
                    {selectedZip ? (
                      <button
                        type="button"
                        onClick={() => setSelectedZip(null)}
                        className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50 lg:inline"
                      >
                        Clear zip
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={activateGroupByTown}
                      className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50 lg:inline"
                      aria-pressed={groupByTown}
                    >
                      {groupByTown ? "Sort by latest timestamp" : "Group by town"}
                    </button>
                    {groupByTown ? (
                      <button
                        type="button"
                        onClick={activateGroupByZip}
                        className="m-0 hidden shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50 lg:inline"
                        aria-pressed={groupByZip}
                      >
                        {groupByZip ? "Ungroup zip" : "Group by zip"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Mobile view chips */}
                <div className="flex flex-wrap items-center gap-1.5 lg:hidden">
                  <button
                    type="button"
                    className={viewChipClass(groupByTown)}
                    aria-pressed={groupByTown}
                    onClick={() => {
                      if (!groupByTown) activateGroupByTown();
                    }}
                  >
                    By town
                  </button>
                  <button
                    type="button"
                    className={viewChipClass(!groupByTown)}
                    aria-pressed={!groupByTown}
                    onClick={() => {
                      if (groupByTown) activateGroupByTown();
                    }}
                  >
                    By time
                  </button>
                  {groupByTown ? (
                    <button
                      type="button"
                      className={viewChipClass(groupByZip)}
                      aria-pressed={groupByZip}
                      onClick={activateGroupByZip}
                    >
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
                  {selectedZip ? (
                    <button
                      type="button"
                      className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy"
                      onClick={() => setSelectedZip(null)}
                    >
                      Clear zip
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] lg:rounded-2xl">
              {loading ||
              (selectedTown &&
                !townFeedReady &&
                visibleListings.length === 0) ? (
                <div className="px-5 py-16 text-center text-slate">
                  <span className="inline-flex items-center gap-2 font-mono text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
                    {selectedTown ? `Loading ${selectedTown} updates…` : "Pulling latest updates…"}
                  </span>
                </div>
              ) : error ? (
                <div className="px-5 py-16 text-center text-slate text-sm">{error}</div>
              ) : visibleListings.length === 0 ? (
                <div className="px-5 py-16 text-center text-slate text-sm">
                  {selectedTown
                    ? `No recent updates in ${selectedTown} right now.`
                    : "No updated listings yet. Run a sync or check back shortly."}
                </div>
              ) : (
                <div>
                  {isGrouped
                    ? feedGroups.map((group) => {
                        const collapsed = groupIsCollapsed(group.label);
                        const statusCounts = summarizeTownStatuses(group.rows);
                        const activeStatus = groupStatusFilter[group.label] ?? null;
                        const filteredRows = activeStatus
                          ? group.rows.filter((row) => row.status === activeStatus)
                          : group.rows;
                        const expanded = expandedGroups.has(group.label);
                        // Always show this town's share of the global 30; only
                        // hide backfilled extras behind "Show more".
                        const previewFloor = Math.max(group.globalCount, 1);
                        const canShowMore =
                          group.isTop && filteredRows.length > previewFloor;
                        const previewBudget =
                          canShowMore && !expanded ? previewFloor : Infinity;

                        const scrollEnabled =
                          !selectedTown && !(canShowMore && expanded);

                        const renderScrollRow = (l: LatestListingRow, dup: "a" | "b") => (
                          <div
                            key={`${l.key}-${dup}`}
                            className="latest-feed-row latest-ticker-row-slot"
                          >
                            <LatestLineRow
                              listing={l}
                              isLive
                              isNew={newKeys.has(l.key)}
                              hideTown={groupByTown || Boolean(selectedTown)}
                              hideZip={Boolean(selectedZip)}
                              showZipMap={groupByZip && !selectedZip}
                              addressColumnCh={addressColumnCh}
                            />
                          </div>
                        );

                        const renderFlatRows = (rows: LatestListingRow[]) => {
                          if (rows.length === 0) {
                            return (
                              <div className="px-4 py-6 text-center font-mono text-[11px] text-slate/70">
                                No {activeStatus?.toLowerCase()} listings in this group.
                              </div>
                            );
                          }
                          return (
                            <LatestSmoothScrollList
                              enabled={scrollEnabled}
                              rows={rows}
                              renderRow={renderScrollRow}
                              phaseKey={group.label}
                            />
                          );
                        };

                        const renderNested = () => {
                          if (!group.subGroups) {
                            const rowsToRender =
                              previewBudget === Infinity
                                ? filteredRows
                                : filteredRows.slice(0, previewBudget);
                            return renderFlatRows(rowsToRender);
                          }

                          let remaining = previewBudget;
                          const blocks: ReactNode[] = [];

                          for (const sub of group.subGroups) {
                            if (remaining <= 0) break;
                            const subRows = activeStatus
                              ? sub.rows.filter((row) => row.status === activeStatus)
                              : sub.rows;
                            if (subRows.length === 0) continue;
                            const take =
                              remaining === Infinity
                                ? subRows
                                : subRows.slice(0, remaining);
                            if (take.length === 0) continue;
                            if (remaining !== Infinity) remaining -= take.length;
                            const subKey = `${group.label}::${sub.label}`;
                            const subZip = normalizeZip(sub.label);
                            blocks.push(
                              <div key={subKey}>
                                <div className="flex items-center gap-2 px-3 sm:px-4 py-1 bg-cream/60 border-b border-charcoal/[0.06] font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
                                  {subZip ? (
                                    <LatestZipMapHover
                                      zip={subZip}
                                      townName={group.label}
                                      className="font-semibold text-navy/55"
                                    />
                                  ) : (
                                    <span className="font-semibold text-navy/55">
                                      {sub.label}
                                    </span>
                                  )}
                                  <span className="text-charcoal/35 tabular-nums">
                                    {subRows.length}
                                  </span>
                                </div>
                                <LatestSmoothScrollList
                                  enabled={scrollEnabled}
                                  rows={take}
                                  renderRow={renderScrollRow}
                                  phaseKey={subKey}
                                />
                              </div>,
                            );
                          }

                          if (blocks.length === 0) {
                            return (
                              <div className="px-4 py-6 text-center font-mono text-[11px] text-slate/70">
                                No {activeStatus?.toLowerCase()} listings in this group.
                              </div>
                            );
                          }
                          return blocks;
                        };

                        const statusPills = statusCounts.map(({ status, count }) => {
                          const selected = activeStatus === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                toggleGroupStatusFilter(group.label, status)
                              }
                              aria-pressed={selected}
                              aria-label={
                                selected
                                  ? `Clear ${status} filter for ${group.label}`
                                  : `Filter ${group.label} to ${status}`
                              }
                              className={`${STATUS_FILTER_PILL_LAYOUT} ${
                                STATUS_PILL_CLASS[status]
                              } ${
                                selected
                                  ? "ring-1 ring-navy/35 ring-offset-0 ring-offset-cream lg:ring-2 lg:ring-offset-1"
                                  : activeStatus
                                    ? "opacity-45"
                                    : ""
                              }`}
                            >
                              <span className="tabular-nums font-semibold">{count}</span>
                              {formatStatusBadgeLabel(status)}
                            </button>
                          );
                        });

                        return (
                          <div key={group.label}>
                            {/* Mobile group header */}
                            <div className="sticky top-0 z-10 space-y-1.5 border-y border-charcoal/[0.08] bg-cream/95 px-3 py-2 backdrop-blur-sm lg:hidden">
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleGroupCollapsed(group.label)}
                                  aria-expanded={!collapsed}
                                  aria-label={
                                    collapsed
                                      ? `Expand ${group.label} listings`
                                      : `Collapse ${group.label} listings`
                                  }
                                  className="group flex min-w-0 items-center gap-2 text-left transition-colors hover:text-navy"
                                >
                                  <FeedCollapseSign
                                    collapsed={collapsed}
                                    size="md"
                                  />
                                  {selectedTown ? null : (
                                    <LatestTownMapHover
                                      townName={group.label}
                                      className="truncate font-mono text-[12px] font-semibold tracking-[0.12em] uppercase text-navy/80"
                                    />
                                  )}
                                </button>
                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-charcoal/45">
                                  {filteredRows.length}
                                  {activeStatus ? ` ${activeStatus}` : ""}
                                </span>
                              </div>
                              {!collapsed && statusPills.length > 0 ? (
                                <div className="flex gap-[3px] overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                  {statusPills}
                                </div>
                              ) : null}
                              {!collapsed && canShowMore ? (
                                <button
                                  type="button"
                                  onClick={() => toggleGroupExpanded(group.label)}
                                  aria-expanded={expanded}
                                  className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy"
                                >
                                  {expanded
                                    ? "Show less"
                                    : `Show ${filteredRows.length - previewFloor} more`}
                                </button>
                              ) : null}
                            </div>

                            {/* Desktop group header */}
                            <div className="sticky top-0 z-10 hidden w-full items-center justify-between gap-2 border-y border-charcoal/[0.08] bg-cream/95 px-4 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase text-charcoal/55 backdrop-blur-sm lg:flex">
                              <button
                                type="button"
                                onClick={() => toggleGroupCollapsed(group.label)}
                                aria-expanded={!collapsed}
                                aria-label={
                                  collapsed
                                    ? `Expand ${group.label} listings`
                                    : `Collapse ${group.label} listings`
                                }
                                className="group flex min-w-0 shrink-0 items-center gap-2 text-left transition-colors hover:text-navy"
                              >
                                <FeedCollapseSign collapsed={collapsed} />
                                {selectedTown ? null : (
                                  <LatestTownMapHover
                                    townName={group.label}
                                    className="shrink-0 font-semibold text-navy/70"
                                  />
                                )}
                              </button>
                              <span className="flex flex-1 flex-wrap items-center justify-center gap-1">
                                {statusPills}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {canShowMore ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleGroupExpanded(group.label)}
                                    aria-expanded={expanded}
                                    className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy transition-colors hover:text-gold"
                                  >
                                    {expanded
                                      ? "Show less"
                                      : `Show ${filteredRows.length - previewFloor} more`}
                                  </button>
                                ) : null}
                                <span className="text-charcoal/45">
                                  <span className="tabular-nums">{filteredRows.length}</span>
                                  {activeStatus ? ` ${activeStatus}` : ""} Listings
                                </span>
                              </span>
                            </div>
                            {!collapsed ? renderNested() : null}
                          </div>
                        );
                      })
                    : (
                        <>
                          {byTimeStatusCounts.length > 0 ? (
                            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-[3px] border-y border-charcoal/[0.08] bg-cream/95 px-3 py-2 backdrop-blur-sm sm:px-4 lg:gap-1 lg:py-1.5">
                              <span className="mr-1 hidden font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45 lg:inline">
                                Filter
                              </span>
                              {byTimeStatusCounts.map(({ status, count }) => {
                                const selected = byTimeActiveStatus === status;
                                return (
                                  <button
                                    key={status}
                                    type="button"
                                    onClick={() =>
                                      toggleGroupStatusFilter(
                                        BY_TIME_STATUS_KEY,
                                        status,
                                      )
                                    }
                                    aria-pressed={selected}
                                    aria-label={
                                      selected
                                        ? `Clear ${status} filter`
                                        : `Filter to ${status}`
                                    }
                                    className={`${STATUS_FILTER_PILL_LAYOUT} ${
                                      STATUS_PILL_CLASS[status]
                                    } ${
                                      selected
                                        ? "ring-1 ring-navy/35 ring-offset-0 ring-offset-cream lg:ring-2 lg:ring-offset-1"
                                        : byTimeActiveStatus
                                          ? "opacity-45"
                                          : ""
                                    }`}
                                  >
                                    <span className="tabular-nums font-semibold">
                                      {count}
                                    </span>
                                    {formatStatusBadgeLabel(status)}
                                  </button>
                                );
                              })}
                              {byTimeActiveStatus ? (
                                <span className="ml-auto font-mono text-[10px] tabular-nums text-charcoal/45 lg:text-[11px]">
                                  {byTimeFilteredListings.length}
                                  {` ${byTimeActiveStatus}`}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {byTimeFilteredListings.length === 0 ? (
                            <div className="px-4 py-6 text-center font-mono text-[11px] text-slate/70">
                              {byTimeActiveStatus
                                ? `No ${byTimeActiveStatus.toLowerCase()} listings in this view.`
                                : "No recent updates."}
                            </div>
                          ) : (
                            byTimeDayGroups.map((day) => {
                              const dayCollapsed = groupIsCollapsed(
                                day.collapseKey,
                              );
                              return (
                                <div key={day.collapseKey}>
                                  <FeedDayGroupHeader
                                    label={day.label}
                                    count={day.rows.length}
                                    collapsed={dayCollapsed}
                                    onToggle={() =>
                                      toggleGroupCollapsed(day.collapseKey)
                                    }
                                  />
                                  {dayCollapsed
                                    ? null
                                    : day.rows.map((l) => (
                                        // Same fixed desktop slot height as the
                                        // group-by-town ticker rows.
                                        <div
                                          key={l.key}
                                          className="latest-feed-row latest-ticker-row-slot"
                                        >
                                          <LatestLineRow
                                            listing={l}
                                            isLive
                                            isNew={newKeys.has(l.key)}
                                            hideTown={Boolean(selectedTown)}
                                            hideZip={Boolean(selectedZip)}
                                            addressColumnCh={addressColumnCh}
                                          />
                                        </div>
                                      ))}
                                </div>
                              );
                            })
                          )}
                        </>
                      )}
                </div>
              )}
              </div>
            </div>

            <LatestTownStats
              className="hidden lg:block"
              stats={townStats}
              loading={loading}
              selectedTown={selectedTown}
              selectedZip={selectedZip}
              onTownSelect={toggleTownFilter}
              onZipSelect={toggleZipFilter}
            />
          </div>
        </div>
      </section>

      <IntelTownStatsDrawer
        open={townStatsOpen}
        onClose={() => setTownStatsOpen(false)}
        title="Town stats"
        ariaLabel="Town stats"
      >
        <div id="latest-town-stats-drawer">
          <LatestTownStats
            showHeading={false}
            stats={townStats}
            loading={loading}
            selectedTown={selectedTown}
            selectedZip={selectedZip}
            onTownSelect={(town) => {
              toggleTownFilter(town);
              /**
               * Multi-zip towns expand into their zip breakdown once selected,
               * so closing here would hide the choice the tap just revealed.
               * Stay put and let the header's Hide button dismiss the drawer.
               */
              if (townHasMultipleZips(town)) return;
              setTownStatsOpen(false);
            }}
            onZipSelect={(town, zip) => {
              toggleZipFilter(town, zip);
              setTownStatsOpen(false);
            }}
          />
        </div>
      </IntelTownStatsDrawer>
    </>
  );
}
