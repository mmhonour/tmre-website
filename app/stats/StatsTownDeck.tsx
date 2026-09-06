"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { readClientPref, writeClientPref } from "@/lib/client-prefs";
import { TOWN_LIST, type StatsCity, type StatsKind, type Town } from "./stats-towns";
import {
  STATS_TOWN_ACCENT_CLASS,
  STATS_TOWN_BORDER_CLASS,
  STATS_TOWN_COLOR,
} from "./stats-town-colors";
import {
  STATS_TOWN_DECK_OPEN_KEY,
  STATS_TOWN_DECK_ORDER_KEY,
  ensureTownOpen,
  parseTownDeckOpen,
  parseTownDeckOrder,
  placeTownRelativeTo,
  serializeTowns,
  toggleTownOpen,
} from "./stats-town-deck";

export type TownDeckStats = {
  city: string;
  activeCount: number;
  medianPrice: number | null;
  avgDaysOnMarket: number | null;
  avgPricePerSqft: number | null;
  avgBeds: number | null;
};

export type TownDeckVintage = {
  label: string;
  count: number;
  share: number;
};

const EMPTY: TownDeckStats = {
  city: "",
  activeCount: 0,
  medianPrice: null,
  avgDaysOnMarket: null,
  avgPricePerSqft: null,
  avgBeds: null,
};

function fmt$(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function bedsRange(avg: number | null): string {
  if (avg == null) return "—";
  const lo = Math.floor(avg);
  return `${lo}–${lo + 1} beds`;
}

function formatTopVintage(v: TownDeckVintage | null | undefined): string {
  if (!v) return "—";
  const pct = Math.round(v.share * 100);
  return pct > 0 ? `${v.label} (${pct}%)` : v.label;
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <circle cx="5" cy="4" r="1.15" fill="currentColor" />
      <circle cx="11" cy="4" r="1.15" fill="currentColor" />
      <circle cx="5" cy="8" r="1.15" fill="currentColor" />
      <circle cx="11" cy="8" r="1.15" fill="currentColor" />
      <circle cx="5" cy="12" r="1.15" fill="currentColor" />
      <circle cx="11" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}

export default function StatsTownDeck({
  stats,
  topVintageByTown,
  loading,
  vintageLoading,
  kind,
  selectedCity,
  onMedianClick,
}: {
  stats: Record<Town, TownDeckStats | null>;
  topVintageByTown: Record<Town, TownDeckVintage | null>;
  loading: boolean;
  vintageLoading: boolean;
  kind: StatsKind;
  selectedCity: StatsCity;
  onMedianClick: (city: Town) => void;
}) {
  const [order, setOrder] = useState<Town[]>([...TOWN_LIST]);
  const [openTowns, setOpenTowns] = useState<Town[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState<Town | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<Town, HTMLDivElement | null>>>({});
  const lastAutoOpen = useRef<StatsCity | null>(null);

  useEffect(() => {
    setOrder(parseTownDeckOrder(readClientPref(STATS_TOWN_DECK_ORDER_KEY)));
    setOpenTowns(parseTownDeckOpen(readClientPref(STATS_TOWN_DECK_OPEN_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeClientPref(STATS_TOWN_DECK_ORDER_KEY, serializeTowns(order));
  }, [hydrated, order]);

  useEffect(() => {
    if (!hydrated) return;
    writeClientPref(STATS_TOWN_DECK_OPEN_KEY, serializeTowns(openTowns));
  }, [hydrated, openTowns]);

  useEffect(() => {
    if (!hydrated) return;
    if (selectedCity === "All") {
      lastAutoOpen.current = "All";
      return;
    }
    if (lastAutoOpen.current === selectedCity) return;
    lastAutoOpen.current = selectedCity;
    setOpenTowns((prev) => ensureTownOpen(prev, selectedCity));
    const card = cardRefs.current[selectedCity];
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hydrated, selectedCity]);

  const townAtPoint = (clientY: number): { town: Town; before: boolean } | null => {
    for (const town of order) {
      if (town === dragging) continue;
      const el = cardRefs.current[town];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return { town, before: clientY < rect.top + rect.height / 2 };
      }
    }
    return null;
  };

  const autoScrollRail = (clientY: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const edge = 36;
    if (clientY < rect.top + edge) rail.scrollTop -= 10;
    else if (clientY > rect.bottom - edge) rail.scrollTop += 10;
  };

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>, town: Town) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(town);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    autoScrollRail(event.clientY);
    const over = townAtPoint(event.clientY);
    if (!over) return;
    setOrder((prev) => {
      const next = placeTownRelativeTo(prev, dragging, over.town, over.before);
      return next.some((town, i) => town !== prev[i]) ? next : prev;
    });
  };

  const onHandlePointerUp = () => {
    setDragging(null);
  };

  const moveTownWithKeys = (town: Town, direction: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(town);
      const swap = idx + direction;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(swap, 0, moved);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-col lg:max-h-[calc(100vh-7.5rem)]">
      <div className="mb-2 shrink-0">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate">
          Town snapshots
        </p>
        <p className="mt-0.5 font-mono text-[9px] tracking-[0.08em] text-slate/70">
          Open any. Drag one over another to stack them.
        </p>
      </div>
      <div
        ref={railRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 max-h-[min(70vh,40rem)] lg:max-h-none"
        data-stats-town-deck=""
      >
        {order.map((city, index) => {
          const expanded = openTowns.includes(city);
          const selected = selectedCity === city;
          return (
            <div
              key={city}
              ref={(el) => {
                cardRefs.current[city] = el;
              }}
              className={index === 0 ? undefined : "-mt-2.5"}
            >
              <TownDeckCard
                city={city}
                data={stats[city]}
                topVintage={topVintageByTown[city]}
                loading={loading}
                vintageLoading={vintageLoading}
                kind={kind}
                expanded={expanded}
                selected={selected}
                dragging={dragging === city}
                onToggle={() => setOpenTowns((prev) => toggleTownOpen(prev, city))}
                onMedianClick={() => onMedianClick(city)}
                onHandlePointerDown={(event) => onHandlePointerDown(event, city)}
                onHandlePointerMove={onHandlePointerMove}
                onHandlePointerUp={onHandlePointerUp}
                onHandleKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveTownWithKeys(city, -1);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveTownWithKeys(city, 1);
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TownDeckCard({
  city,
  data: d,
  topVintage,
  loading,
  vintageLoading,
  kind,
  expanded,
  selected,
  dragging,
  onToggle,
  onMedianClick,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onHandleKeyDown,
}: {
  city: Town;
  data: TownDeckStats | null;
  topVintage: TownDeckVintage | null;
  loading: boolean;
  vintageLoading: boolean;
  kind: StatsKind;
  expanded: boolean;
  selected: boolean;
  dragging: boolean;
  onToggle: () => void;
  onMedianClick: () => void;
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onHandlePointerUp: () => void;
  onHandleKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const unavailable = !d && !loading;
  const safe = d ?? { ...EMPTY, city };
  const isRental = kind === "rental";
  const medianLabel = isRental ? "Median closed rent" : "Median closed price";
  const peekValue = loading ? "…" : unavailable ? "—" : fmt$(safe.medianPrice);
  const metrics = [
    {
      label: isRental ? "Active rentals" : "Active listings",
      value: loading ? "…" : safe.activeCount.toLocaleString("en-US"),
    },
    {
      label: medianLabel,
      value: loading ? "…" : fmt$(safe.medianPrice),
      clickable: true,
    },
    {
      label: "Most popular vintage",
      value: vintageLoading ? "…" : formatTopVintage(topVintage),
    },
    {
      label: "Avg DOM",
      value:
        loading ? "…" : safe.avgDaysOnMarket != null ? `${Math.round(safe.avgDaysOnMarket)}d` : "—",
    },
    ...(isRental
      ? []
      : [
          {
            label: "Avg $/sqft",
            value:
              loading
                ? "…"
                : safe.avgPricePerSqft != null
                  ? `$${Math.round(safe.avgPricePerSqft)}`
                  : "—",
          },
        ]),
    { label: "Avg bedrooms", value: loading ? "…" : bedsRange(safe.avgBeds) },
  ];

  return (
    <article
      className={`relative rounded-2xl border bg-white transition-[box-shadow,transform,opacity] ${
        STATS_TOWN_BORDER_CLASS[city]
      } ${
        dragging
          ? "z-40 scale-[1.02] opacity-90 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.45)]"
          : expanded
            ? "z-20 shadow-[0_12px_28px_-18px_rgba(0,0,0,0.35)]"
            : "z-10"
      } ${selected ? "ring-1 ring-gold/45" : ""} ${loading ? "animate-pulse" : ""}`}
      aria-grabbed={dragging}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          className="flex w-8 shrink-0 cursor-grab items-center justify-center text-slate/55 touch-none hover:text-navy active:cursor-grabbing"
          aria-label={`Reorder ${city}. Use arrow keys to move.`}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          onKeyDown={onHandleKeyDown}
        >
          <DragHandleIcon />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-3 pr-3 text-left"
          aria-expanded={expanded}
          aria-controls={`stats-town-deck-body-${city.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-6 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: STATS_TOWN_COLOR[city] }}
              aria-hidden
            />
            <span className="min-w-0">
              <span
                className={`block font-serif text-[17px] leading-tight ${STATS_TOWN_ACCENT_CLASS[city]}`}
              >
                {city}
              </span>
              <span className="block font-mono text-[9px] tracking-[0.16em] uppercase text-slate">
                {unavailable ? "Feed unavailable" : peekValue}
              </span>
            </span>
          </span>
          <span className="shrink-0 font-mono text-[9px] tracking-[0.14em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2">
            {expanded ? "Less" : "More"}
          </span>
        </button>
      </div>
      <div
        id={`stats-town-deck-body-${city.replace(/\s+/g, "-").toLowerCase()}`}
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: expanded ? 420 : 0 }}
        aria-hidden={!expanded}
      >
        <div className="space-y-3 px-3 pb-4 pl-8">
          {unavailable ? (
            <p className="font-mono text-[10px] tracking-wide text-coral/80">Feed unavailable</p>
          ) : (
            metrics.map((m) => (
              <div key={m.label} className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                  {m.label}
                </span>
                {m.clickable && !loading ? (
                  <button
                    type="button"
                    onClick={onMedianClick}
                    className="font-mono text-sm font-medium tabular-nums text-navy underline decoration-charcoal/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
                    aria-label={`View ${city} median price listings`}
                  >
                    {m.value}
                  </button>
                ) : (
                  <span className="font-mono text-sm font-medium tabular-nums text-navy">
                    {m.value}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );
}
