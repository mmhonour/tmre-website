"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DealBoardList from "@/components/intelligence/deal-board/DealBoardList";
import GoldilocksScoreExplainModal from "@/components/GoldilocksScoreExplainModal";
import ListingScoreBreakdownModal from "@/components/ListingScoreBreakdownModal";
import {
  DEAL_BOARD_SORT_DIRS,
  DEAL_BOARD_SORT_KEYS,
  sortDealBoardListings,
  type DealBoardSortDir,
  type DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";
import type {
  DealBoardListing,
  DealBoardRowStatus,
  DealBoardStatusFilter,
} from "@/components/intelligence/deal-board/deal-board-types";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";
import {
  DEAL_BOARD_CARD_VIEW_VALUES,
  DEAL_BOARD_VIEW_DEFAULT,
  DEAL_BOARD_VIEW_PREF_KEY,
  DEAL_BOARD_VIEW_VALUES,
  dealBoardCardView,
  dealBoardViewDefaultForViewport,
  type DealBoardView,
} from "@/lib/deal-board-view";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";
import {
  clearLookedAtListings,
  LOOKED_AT_CHANGED_EVENT,
  LOOKED_AT_STORAGE_KEY,
  readLookedAtListings,
  type LookedAtEntry,
} from "@/lib/looked-at-listings";
import { listingDetailHref } from "@/lib/listing-url";
import { prefetchMlsPhotoThumbs } from "@/lib/prefetch-listing-images";

type BoardApiListing = {
  key: string;
  listingKey?: string | null;
  mlsId?: string | null;
  score?: number;
  scoreBreakdown?: ScoreBreakdown | null;
  address: string;
  city?: string | null;
  type: string;
  price: number;
  pricePerSqft?: number | null;
  sqft?: number | null;
  lotAcres?: number | null;
  dom?: number | null;
  status: DealBoardRowStatus;
  contractStatus?: string | null;
  isRental?: boolean;
  beds?: number | null;
  baths?: number | null;
  yearBuilt?: number | null;
  headline?: string;
  photoCount?: number | null;
  primaryPhotoIndex?: number | null;
};

type BoardApiResponse = {
  towns?: Record<string, BoardApiListing[]>;
};

const STATUS_FILTERS: readonly DealBoardStatusFilter[] = [
  "all",
  "new",
  "reduced",
  "active",
];

function shortType(propertyType: string | null): string {
  if (!propertyType) return "Listing";
  const t = propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
  if (/single family/i.test(t)) return "SFR";
  if (/condo|co-op/i.test(t)) return "Condo";
  if (/multi/i.test(t)) return "Multi";
  if (/rental/i.test(t)) return "Rental";
  return t;
}

function idKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function boardToDealListing(row: BoardApiListing): DealBoardListing {
  return {
    key: row.mlsId?.trim() || row.key,
    listingKey: row.listingKey ?? null,
    score: row.score ?? 0,
    scoreBreakdown: row.scoreBreakdown ?? null,
    address: row.address,
    city: row.city ?? null,
    type: row.type,
    price: row.price,
    pricePerSqft: row.pricePerSqft ?? null,
    sqft: row.sqft ?? null,
    lotAcres: row.lotAcres ?? null,
    dom: row.dom ?? null,
    status: row.status,
    contractStatus: row.contractStatus ?? null,
    isRental: Boolean(row.isRental),
    beds: row.beds ?? null,
    baths: row.baths ?? null,
    yearBuilt: row.yearBuilt ?? null,
    headline: row.headline ?? "",
    photoCount: row.photoCount ?? null,
    primaryPhotoIndex: row.primaryPhotoIndex ?? null,
  };
}

function fallbackDealListing(entry: LookedAtEntry): DealBoardListing {
  return {
    key: entry.id,
    listingKey: entry.id,
    score: 0,
    address: entry.address,
    city: entry.city,
    type: shortType(entry.propertyType),
    price: entry.price ?? 0,
    pricePerSqft: null,
    sqft: null,
    dom: null,
    status: "Active",
    isRental: /rental|lease/i.test(entry.propertyType ?? ""),
    headline: "",
  };
}

function matchesStatus(
  listing: DealBoardListing,
  filter: DealBoardStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "new") return listing.status === "New";
  if (filter === "reduced") return listing.status === "Reduced";
  return listing.status === "Active";
}

export default function LookeyClient() {
  const [entries, setEntries] = useState<LookedAtEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [boardById, setBoardById] = useState<Map<string, DealBoardListing> | null>(
    null,
  );
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const [scoreListing, setScoreListing] = useState<DealBoardListing | null>(null);
  const pathname = usePathname();

  const [sortKey, setSortKey] = usePersistedFilter<DealBoardSortKey>(
    "tmre_lookey_sort_key_v2",
    "looked",
    DEAL_BOARD_SORT_KEYS,
  );
  const [sortDir, setSortDir] = usePersistedFilter<DealBoardSortDir>(
    "tmre_lookey_sort_dir",
    "desc",
    DEAL_BOARD_SORT_DIRS,
  );
  const [boardView, setBoardView] = usePersistedFilter<DealBoardView>(
    DEAL_BOARD_VIEW_PREF_KEY,
    DEAL_BOARD_VIEW_DEFAULT,
    DEAL_BOARD_VIEW_VALUES,
    false,
    dealBoardViewDefaultForViewport,
  );
  const [statusFilter, setStatusFilter] = usePersistedFilter<DealBoardStatusFilter>(
    "tmre_lookey_status",
    "all",
    STATUS_FILTERS,
  );

  const refresh = useCallback(() => {
    const next = readLookedAtListings();
    setEntries(next);
    prefetchMlsPhotoThumbs(next.map((e) => e.id));
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOOKED_AT_STORAGE_KEY || event.key === null) refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener(LOOKED_AT_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(LOOKED_AT_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (pathname === "/lookey") refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/intelligence/deal-board", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setBoardById(new Map());
          return;
        }
        const body = (await res.json()) as BoardApiResponse;
        const next = new Map<string, DealBoardListing>();
        for (const rows of Object.values(body.towns ?? {})) {
          for (const row of rows) {
            const listing = boardToDealListing(row);
            for (const raw of [row.mlsId, row.key, row.listingKey, listing.key]) {
              const id = idKey(raw);
              if (id) next.set(id, listing);
            }
          }
        }
        if (!cancelled) setBoardById(next);
      } catch {
        if (!cancelled) setBoardById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const viewedAtById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(idKey(entry.id), Date.parse(entry.viewedAt) || 0);
    }
    return map;
  }, [entries]);

  const viewedAtMs = (listing: DealBoardListing): number =>
    viewedAtById.get(idKey(listing.key)) ??
    viewedAtById.get(idKey(listing.listingKey)) ??
    0;

  const boardRows = useMemo(() => {
    return entries.map((entry) => {
      const fromBoard = boardById?.get(idKey(entry.id));
      return fromBoard ?? fallbackDealListing(entry);
    });
  }, [entries, boardById]);

  const filteredRows = useMemo(
    () => boardRows.filter((row) => matchesStatus(row, statusFilter)),
    [boardRows, statusFilter],
  );

  const sortedRows = useMemo(() => {
    if (sortKey === "looked") {
      const dir = sortDir === "asc" ? 1 : -1;
      return [...filteredRows].sort((a, b) => {
        const cmp = viewedAtMs(a) - viewedAtMs(b);
        if (cmp !== 0) return cmp * dir;
        return (b.score ?? 0) - (a.score ?? 0);
      });
    }
    const sorted = sortDealBoardListings(filteredRows, sortKey, sortDir);
    if (sortKey !== "score") return sorted;
    return [...sorted].sort((a, b) => {
      if (a.score !== b.score) return 0;
      return viewedAtMs(b) - viewedAtMs(a);
    });
  }, [filteredRows, sortKey, sortDir, viewedAtById]);

  const scoreRankByKey = useMemo(() => {
    const ranked = [...boardRows].sort((a, b) => b.score - a.score);
    return new Map(ranked.map((row, i) => [row.key, i + 1]));
  }, [boardRows]);

  const handleSort = (key: DealBoardSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  /** Sort drawer ↑ / ↓: field and direction land in one action. */
  const handleSortDir = (key: DealBoardSortKey, dir: DealBoardSortDir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  const handleClear = () => {
    clearLookedAtListings();
    setEntries([]);
  };

  const loadingBoard = hydrated && entries.length > 0 && boardById == null;

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            My List
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Looked{" "}
            <span className="italic gold-shimmer">at...</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Properties you&apos;ve opened are saved in your browser — up to 40
            recent views. Same board views as Intelligence.
          </p>
          {entries.length > 0 && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
              {entries.length}{" "}
              {entries.length === 1 ? "property" : "properties"} saved
            </p>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {!hydrated ? (
            <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-16 text-center text-slate">
              <span className="inline-flex items-center gap-2 font-mono text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
                Loading your list…
              </span>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-28">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-4">
                No viewed properties yet
              </p>
              <p className="text-charcoal/70 mb-8 max-w-sm mx-auto">
                Open any listing from{" "}
                <Link href="/intelligence" className="text-gold hover:underline">
                  Intelligence
                </Link>
                ,{" "}
                <Link href="/find" className="text-gold hover:underline">
                  Find
                </Link>
                , or the Deal Board — it will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleClear}
                  className="font-mono text-[10px] tracking-[0.15em] uppercase text-coral/60 hover:text-coral transition-colors"
                >
                  Clear history
                </button>
              </div>
              <DealBoardList
                topRows={sortedRows}
                middleRows={[]}
                bottomRows={[]}
                canTier={false}
                middleTierExpanded
                hideMiddleTierToggle
                onMiddleTierToggle={() => {}}
                resultCount={sortedRows.length}
                scoreRankByKey={scoreRankByKey}
                rankTotal={boardRows.length}
                isLive
                showTown
                showLookedSort
                loading={loadingBoard}
                loadingLabel="Loading listing details…"
                emptyLabel={
                  statusFilter === "all"
                    ? "No viewed properties match this view."
                    : `No ${statusFilter} listings in your looked-at list.`
                }
                onResetFilters={() => setStatusFilter("all")}
                onScoreClick={(listing) => {
                  if (listing.scoreBreakdown) {
                    setScoreListing(listing);
                    return;
                  }
                  setScoreInfoOpen(true);
                }}
                onStatusClick={() => {}}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                onSortDir={handleSortDir}
                boardView={dealBoardCardView(boardView)}
                onBoardViewChange={setBoardView}
                viewOptions={DEAL_BOARD_CARD_VIEW_VALUES}
                boardStatusFilter={statusFilter}
                onBoardStatusFilterChange={setStatusFilter}
                scoreInfoButton={
                  <button
                    type="button"
                    onClick={() => setScoreInfoOpen(true)}
                    aria-label="How scoring works"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-navy/20 font-mono text-[10px] text-navy/70 hover:border-navy/40 hover:text-navy"
                  >
                    i
                  </button>
                }
                resultsSummary={
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                    {sortedRows.length.toLocaleString()} of{" "}
                    {boardRows.length.toLocaleString()}
                    {sortKey === "looked" ? (
                      <span className="italic normal-case tracking-normal">
                        , last looked
                      </span>
                    ) : sortKey === "score" ? (
                      <span className="italic normal-case tracking-normal">
                        , scored
                      </span>
                    ) : null}
                  </p>
                }
                footer={
                  <div className="border-t border-charcoal/[0.12] bg-cream/60 px-5 py-3">
                    <Link
                      href="/intelligence"
                      className="font-mono text-[11px] tracking-[0.15em] uppercase text-navy/60 hover:text-gold transition-colors"
                    >
                      ← Back to Intelligence
                    </Link>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </section>

      {scoreInfoOpen ? (
        <GoldilocksScoreExplainModal
          topic="composite"
          context={{}}
          onClose={() => setScoreInfoOpen(false)}
        />
      ) : null}
      {scoreListing?.scoreBreakdown ? (
        <ListingScoreBreakdownModal
          open
          onClose={() => setScoreListing(null)}
          score={scoreListing.scoreBreakdown}
          title={scoreListing.address}
          subtitle={scoreListing.city}
          listingHref={listingDetailHref(
            scoreListing.key,
            scoreListing.address,
            scoreListing.city,
          )}
          isRental={scoreListing.isRental}
        />
      ) : null}
    </>
  );
}
