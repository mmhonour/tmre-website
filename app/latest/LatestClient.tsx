"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import LatestLineRow from "@/components/latest/LatestLineRow";
import LatestSearchAlertForm from "@/components/latest/LatestSearchAlertForm";
import LatestSmoothScrollList from "@/components/latest/LatestSmoothScrollList";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";
import LatestTownStats from "@/components/latest/LatestTownStats";
import { prefetchAllTownSnapshots } from "@/components/latest/LatestIntelligenceTownSnapshot";
import type { LatestListingRow, TownUpdateStat } from "@/lib/latest-listings";
import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { prefetchMlsPhotoThumbsOrdered } from "@/lib/prefetch-listing-images";
import { mlsTimestampMs } from "@/lib/mls-time";
import { TMRE_TOWNS_LABEL, normalizeZip } from "@/lib/tmre-towns";

type ApiResponse = {
  listings: LatestListingRow[];
  count: number;
  townStats: TownUpdateStat[];
  since: string | null;
  lastIncrementalSync: string | null;
  lastFullSync: string | null;
  generatedAt: string;
};

const LATEST_LIMIT = 30;
// When a town is selected in the stats sidebar, expand that town's feed to show
// up to this many of its most recently updated listings (vs. its slice of the
// global 30). Deselecting reverts to the town's share of the global feed.
const TOWN_EXPAND_LIMIT = 30;
// In grouped view, the first N town groups preview this many listings and reveal
// the rest behind a "Show more" toggle. Top groups are backfilled from the DB so
// they always have at least the preview count available (when the town has them).
const TOP_TOWN_COUNT = 3;
const TOWN_PREVIEW_LIMIT = 5;
const TOP_TOWN_FETCH_LIMIT = 25;
const POLL_MS = LATEST_DB_REFRESH_MS;
const LATEST_REFRESH_MINUTES = LATEST_DB_REFRESH_MS / 60_000;

const STATUS_SUMMARY_ORDER: LatestListingRow["status"][] = [
  "New",
  "Reduced",
  "Pending",
  "Active",
];

const STATUS_PILL_CLASS: Record<LatestListingRow["status"], string> = {
  New: "bg-sage/10 text-sage border-sage/30",
  Active: "bg-sky/10 text-sky border-sky/30",
  Reduced: "bg-coral/10 text-coral border-coral/30",
  Pending: "bg-charcoal/10 text-slate border-charcoal/20",
};

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

function modificationMs(iso: string | null | undefined): number {
  const t = mlsTimestampMs(iso);
  return Number.isNaN(t) ? 0 : t;
}

function pickListingRow(
  a: LatestListingRow,
  b: LatestListingRow,
): LatestListingRow {
  const aMs = modificationMs(a.modificationTimestamp);
  const bMs = modificationMs(b.modificationTimestamp);
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
  return Array.from(byKey.values())
    .sort(
      (a, b) =>
        modificationMs(b.modificationTimestamp) - modificationMs(a.modificationTimestamp),
    )
    .slice(0, LATEST_LIMIT);
}

function newestModification(listings: LatestListingRow[]): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const row of listings) {
    const t = modificationMs(row.modificationTimestamp);
    if (t > bestMs) {
      bestMs = t;
      best = row.modificationTimestamp;
    }
  }
  return best;
}

// Formatters use the viewer's local timezone (no explicit timeZone option).
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
  if (key === todayKey) return `Today, ${fullDate}`;
  const yesterday = new Date(Date.now() - 86_400_000);
  if (key === LOCAL_DATE_KEY_FMT.format(yesterday)) return `Yesterday, ${fullDate}`;
  return fullDate;
}

type FeedSubGroup = {
  label: string;
  rows: LatestListingRow[];
};

type FeedGroup = {
  label: string;
  rows: LatestListingRow[];
  isTop: boolean;
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
    .sort(
      (a, b) =>
        modificationMs(b.modificationTimestamp) - modificationMs(a.modificationTimestamp),
    );
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
  const [listings, setListings] = useState<LatestListingRow[]>(initialListings);
  const [townStats, setTownStats] = useState<TownUpdateStat[]>(initialTownStats);
  const [loading, setLoading] = useState(initialListings.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [groupByTown, setGroupByTown] = useState(true);
  const [groupByZip, setGroupByZip] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedTown, setSelectedTown] = useState<string | null>(null);
  const [townListings, setTownListings] = useState<LatestListingRow[]>([]);
  const [townLoading, setTownLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  /** Per-group status filter from group-header pills (null / missing = all). */
  const [groupStatusFilter, setGroupStatusFilter] = useState<
    Partial<Record<string, LatestListingRow["status"]>>
  >({});
  const [topTownBackfill, setTopTownBackfill] = useState<Record<string, LatestListingRow[]>>({});
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

  useEffect(() => {
    if (!groupByTown) setGroupByZip(false);
  }, [groupByTown]);

  const fetchAllTownFeeds = useCallback(async (): Promise<void> => {
    const res = await fetch("/api/listings/latest/towns", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      towns?: Record<string, LatestListingRow[]>;
    };
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
        townCacheRef.current.set(town, rows);
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

    const res = await fetch(`/api/listings/latest?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as ApiResponse;
    setLastSync(body.lastIncrementalSync ?? body.lastFullSync);
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
      setListings((current) => {
        const merged = mergeListings(current, body.listings);
        watermarkRef.current = newestModification(merged);
        return merged;
      });
    } else {
      const capped = body.listings.slice(0, LATEST_LIMIT);
      setListings(capped);
      watermarkRef.current = newestModification(capped);
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
      return;
    }
    let cancelled = false;
    const cached = townCacheRef.current.get(selectedTown);
    if (cached) {
      setTownListings(cached);
      setTownLoading(false);
      return;
    }
    const placeholder = listingsForTown(listings, selectedTown);
    setTownListings(placeholder);
    setTownLoading(placeholder.length === 0);
    void fetchTownListings(selectedTown)
      .then((rows) => {
        if (!cancelled) setTownListings(rows);
      })
      .catch(() => {
        if (!cancelled && placeholder.length === 0) setTownListings([]);
      })
      .finally(() => {
        if (!cancelled) setTownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTown, fetchTownListings, listings]);

  const visibleListings = useMemo(() => {
    if (!selectedTown) return listings;
    return townListings;
  }, [listings, selectedTown, townListings]);

  // Preload all town market snapshots from SQLite so sidebar clicks are instant.
  useEffect(() => {
    if (loading) return;
    void prefetchAllTownSnapshots();
  }, [loading]);

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

  const isGrouped = groupByTown;

  const feedGroups = useMemo((): FeedGroup[] => {
    if (!isGrouped) return [];

    const townGroups = groupRowsByKey(visibleListings, townGroupKey);
    return townGroups.map((group, idx) => {
      const isTop = !selectedTown && idx < TOP_TOWN_COUNT;
      const backfill = isTop ? topTownBackfill[group.label] : undefined;
      const base =
        backfill && backfill.length > group.rows.length ? backfill : group.rows;
      if (groupByZip) {
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
          subGroups,
        };
      }
      return { label: group.label, rows: base, isTop, subGroups: null };
    });
  }, [
    visibleListings,
    groupByTown,
    groupByZip,
    isGrouped,
    selectedTown,
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

  // Top town groups that don't yet have enough listings in the global feed to hit the
  // preview count — fetch the rest of the town's recent updates to backfill.
  const topTownsNeedingBackfill = useMemo(() => {
    if (selectedTown || !groupByTown) return [];
    return feedGroups
      .slice(0, TOP_TOWN_COUNT)
      .filter(
        (g) =>
          g.rows.length < TOWN_PREVIEW_LIMIT &&
          (topTownBackfill[g.label]?.length ?? 0) < TOWN_PREVIEW_LIMIT,
      )
      .map((g) => g.label);
  }, [feedGroups, selectedTown, topTownBackfill, groupByTown]);

  const toggleTownFilter = useCallback((town: string) => {
    setSelectedTown((prev) => (prev === town ? null : town));
  }, []);

  const toggleGroupCollapsed = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

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
      setCollapsedGroups((prev) => {
        if (!prev.has(label)) return prev;
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    },
    [],
  );

  const resetGroupUi = useCallback(() => {
    setCollapsedGroups(new Set());
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

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-5 lg:pt-28 lg:pb-6 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Explore
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Latest{" "}
            <span className="italic gold-shimmer">updates.</span>
          </h1>
          <p className="mt-4 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            <span className="text-gold font-medium">30 on 30</span> — the{" "}
            {LATEST_LIMIT} most recently updated active listings across {TMRE_TOWNS_LABEL},
            refreshed every {LATEST_REFRESH_MINUTES} minutes and sorted by modification time —
            live without reloading the page.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs animate-fade-up-delay-2">
            <span className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  loading ? "bg-gold animate-pulse-dot" : "bg-sage animate-pulse-dot"
                }`}
              />
              <span className="text-white/50">{summary}</span>
            </span>
            {syncLabel ? (
              <span className="text-white/40 tracking-[0.08em] uppercase">
                Synced {syncLabel}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-cream pt-4 pb-0 lg:pt-5">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <LatestSearchAlertForm />
        </div>
      </section>

      <section className="bg-cream pt-4 pb-10 lg:pt-5 lg:pb-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-5 lg:items-start">
            <div className="min-w-0">
              <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
              {loading || (selectedTown && townLoading && visibleListings.length === 0) ? (
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 sm:px-4 py-2 border-b border-charcoal/[0.08] bg-cream/40 font-mono text-[11px] tracking-[0.12em] uppercase text-charcoal/45">
                    {groupByTown && groupByZip ? (
                      <span className="min-w-0 basis-full sm:basis-auto sm:flex-1 text-left">
                        Grouped By Town · Zip
                      </span>
                    ) : groupByTown ? (
                      <span className="min-w-0 basis-full sm:basis-auto sm:flex-1 text-left">
                        Grouped By Town
                      </span>
                    ) : (
                      <span className="min-w-0 basis-full sm:basis-auto sm:flex-1 text-left">
                        By Updated Timestamp
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={activateGroupByTown}
                        className="shrink-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy hover:text-gold transition-colors border border-charcoal/15 hover:border-gold rounded-full px-2.5 py-1"
                        aria-pressed={groupByTown}
                      >
                        {groupByTown ? "SORT BY LATEST TIMESTAMP" : "Group by town"}
                      </button>
                      {groupByTown ? (
                        <button
                          type="button"
                          onClick={activateGroupByZip}
                          className="shrink-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy hover:text-gold transition-colors border border-charcoal/15 hover:border-gold rounded-full px-2.5 py-1"
                          aria-pressed={groupByZip}
                        >
                          {groupByZip ? "UNGROUP ZIP" : "Group by zip"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {isGrouped
                    ? feedGroups.map((group) => {
                        const collapsed = collapsedGroups.has(group.label);
                        const statusCounts = summarizeTownStatuses(group.rows);
                        const activeStatus = groupStatusFilter[group.label] ?? null;
                        const filteredRows = activeStatus
                          ? group.rows.filter((row) => row.status === activeStatus)
                          : group.rows;
                        const expanded = expandedGroups.has(group.label);
                        const canShowMore =
                          group.isTop && filteredRows.length > TOWN_PREVIEW_LIMIT;
                        const previewBudget =
                          canShowMore && !expanded ? TOWN_PREVIEW_LIMIT : Infinity;

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
                              hideTown={groupByTown}
                              showZipMap={groupByZip}
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

                        return (
                          <div key={group.label}>
                            <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-2 px-3 sm:px-4 py-1.5 bg-cream/95 backdrop-blur-sm border-y border-charcoal/[0.08] font-mono text-[11px] tracking-[0.14em] uppercase text-charcoal/55">
                              <button
                                type="button"
                                onClick={() => toggleGroupCollapsed(group.label)}
                                aria-expanded={!collapsed}
                                aria-label={
                                  collapsed
                                    ? `Expand ${group.label} listings`
                                    : `Collapse ${group.label} listings`
                                }
                                className="group flex min-w-0 items-center gap-2 shrink-0 hover:text-navy transition-colors text-left"
                              >
                                <span
                                  className="inline-flex h-6 w-6 items-center justify-center shrink-0 rounded-md border border-charcoal/20 bg-white text-navy/75 shadow-sm transition-colors group-hover:border-gold/40 group-hover:text-navy"
                                  aria-hidden
                                >
                                  {/* Down = expand collapsed; Up = minimize expanded */}
                                  <svg
                                    viewBox="0 0 16 16"
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    {collapsed ? (
                                      <path d="M3 6l5 5 5-5" />
                                    ) : (
                                      <path d="M3 10l5-5 5 5" />
                                    )}
                                  </svg>
                                </span>
                                <LatestTownMapHover
                                  townName={group.label}
                                  className="font-semibold text-navy/70 shrink-0"
                                />
                              </button>
                              <span className="flex flex-1 flex-wrap items-center justify-center gap-1">
                                {statusCounts.map(({ status, count }) => {
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
                                      className={`inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.12em] uppercase border rounded-full px-2 py-0.5 transition-colors cursor-pointer hover:opacity-90 ${
                                        STATUS_PILL_CLASS[status]
                                      } ${
                                        selected
                                          ? "ring-2 ring-navy/35 ring-offset-1 ring-offset-cream"
                                          : activeStatus
                                            ? "opacity-45"
                                            : ""
                                      }`}
                                    >
                                      <span className="tabular-nums font-semibold">{count}</span>
                                      {status === "Reduced" ? "Reduced!" : status}
                                    </button>
                                  );
                                })}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {canShowMore ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleGroupExpanded(group.label)}
                                    aria-expanded={expanded}
                                    className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy hover:text-gold transition-colors"
                                  >
                                    {expanded
                                      ? "Show less"
                                      : `Show ${filteredRows.length - TOWN_PREVIEW_LIMIT} more`}
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
                    : visibleListings.map((l, i) => {
                          const key = localDateKey(l.modificationTimestamp);
                          const prevKey =
                            i > 0
                              ? localDateKey(
                                  visibleListings[i - 1].modificationTimestamp,
                                )
                              : null;
                          const showHeader = key !== prevKey;
                          return (
                            <div key={l.key} className="latest-feed-row">
                              {showHeader ? (
                                <div className="sticky top-0 z-10 flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-cream/95 backdrop-blur-sm border-y border-charcoal/[0.08] font-mono text-[11px] tracking-[0.14em] uppercase text-charcoal/55">
                                  <span
                                    className="w-1 h-1 rounded-full bg-gold shrink-0"
                                    aria-hidden
                                  />
                                  <span className="font-semibold text-navy/70">
                                    {localDateLabel(l.modificationTimestamp)}
                                  </span>
                                </div>
                              ) : null}
                              <LatestLineRow
                                listing={l}
                                isLive
                                isNew={newKeys.has(l.key)}
                                addressColumnCh={addressColumnCh}
                              />
                            </div>
                          );
                        })}
                </div>
              )}
              </div>
            </div>

            <LatestTownStats
              stats={townStats}
              loading={loading}
              selectedTown={selectedTown}
              onTownSelect={toggleTownFilter}
            />
          </div>
        </div>
      </section>
    </>
  );
}
