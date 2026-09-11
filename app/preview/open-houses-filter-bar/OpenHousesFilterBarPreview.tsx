"use client";

import { useEffect, useRef, useState } from "react";
import LatestSearchAlertForm from "@/components/latest/LatestSearchAlertForm";
import TownFilterPills from "@/components/TownFilterPills";
import {
  exclusiveOpenHouseFocus,
} from "@/lib/open-houses-focus";
import {
  filterPillButtonClass,
  filterPillContainerClass,
} from "@/lib/filter-pill-styles";
import { TMRE_TOWNS } from "@/lib/tmre-towns";
import { fallbackCriteriaFromPage } from "@/lib/visitor-search-profile";

const TX = [
  { value: "all", label: "All" },
  { value: "sale", label: "For Sale" },
  { value: "rental", label: "Rental" },
] as const;

function creamChipClass(active: boolean): string {
  return `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
    active
      ? "border-gold/50 bg-gold/10 text-navy"
      : "border-charcoal/[0.08] bg-white text-navy hover:border-gold/40"
  }`;
}

function PlaceRow({
  theme,
  tx,
  setTx,
  town,
  setTown,
}: {
  theme: "dark" | "light";
  tx: (typeof TX)[number]["value"];
  setTx: (value: (typeof TX)[number]["value"]) => void;
  town: "All" | (typeof TMRE_TOWNS)[number];
  setTown: (value: "All" | (typeof TMRE_TOWNS)[number]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className={filterPillContainerClass("compact", { wrap: false, theme })}>
        {TX.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTx(f.value)}
            aria-pressed={tx === f.value}
            className={filterPillButtonClass(tx === f.value, "compact", theme)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <TownFilterPills
        towns={TMRE_TOWNS}
        selected={town}
        onSelect={setTown}
        counts={{ All: 12, Westport: 5, Wilton: 3 }}
        allLabel="All Towns"
        showSeparatorAfterAll
        size="compact"
        scrollable
        theme={theme}
        className="min-w-0 flex-1"
      />
    </div>
  );
}

export function OpenHousesFilterBarPreview() {
  const [tx, setTx] = useState<(typeof TX)[number]["value"]>("all");
  const [town, setTown] = useState<"All" | (typeof TMRE_TOWNS)[number]>("All");
  const [most, setMost] = useState(false);
  const [first, setFirst] = useState(false);
  const [docked, setDocked] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setDocked(!entry.isIntersecting),
      { rootMargin: "-6rem 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <section className="navy-gradient relative overflow-hidden px-6 pb-10 pt-8 text-white">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gold">
          Open Houses
        </p>
        <h2 className="max-w-xl font-serif text-3xl leading-tight">
          Sale / rental and towns live in the hero.
        </h2>
        <p className="mt-3 max-w-lg text-sm text-white/70">
          Scroll down — they dock into the cream bar. Most / First stay exclusive
          on their own line. Alerts left, view glyphs right.
        </p>
        <div className="mt-5">
          <PlaceRow
            theme="dark"
            tx={tx}
            setTx={setTx}
            town={town}
            setTown={setTown}
          />
        </div>
        <div ref={sentinelRef} className="h-px w-full" aria-hidden />
      </section>

      <div className="sticky top-20 z-30 border-b border-charcoal/[0.08] bg-cream/95 px-6 py-3 backdrop-blur-sm lg:top-24">
        <div className="flex flex-col gap-3">
          {docked ? (
            <PlaceRow
              theme="light"
              tx={tx}
              setTx={setTx}
              town={town}
              setTown={setTown}
            />
          ) : null}
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="First showing or most open houses"
          >
            <button
              type="button"
              aria-pressed={most}
              onClick={() => {
                const next = exclusiveOpenHouseFocus("most", !most);
                setMost(next.most);
                setFirst(next.first);
              }}
              className={creamChipClass(most)}
            >
              Most open houses
            </button>
            <button
              type="button"
              aria-pressed={first}
              onClick={() => {
                const next = exclusiveOpenHouseFocus("first", !first);
                setMost(next.most);
                setFirst(next.first);
              }}
              className={creamChipClass(first)}
            >
              First showing
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={creamChipClass(true)}>Date</span>
            <span className={creamChipClass(false)}>By day</span>
            <span className={creamChipClass(false)}>Price</span>
            <span className={creamChipClass(false)}>Close all towns</span>
          </div>
          <div className="flex min-h-8 items-center justify-between gap-3">
            <LatestSearchAlertForm
              variant="open-houses"
              fallbackCriteria={fallbackCriteriaFromPage({
                town: town === "All" ? null : town,
                tx,
              })}
              triggerId="preview-open-house-alerts"
            />
            <div
              className="inline-flex items-center rounded-full border border-charcoal/[0.08] bg-white p-0.5"
              role="group"
              aria-label="Listing layout"
            >
              {["Grid", "Rows", "Line"].map((label, i) => (
                <span
                  key={label}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-mono text-[9px] ${
                    i === 0 ? "bg-navy text-white" : "text-navy/55"
                  }`}
                >
                  {label[0]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-10">
        <p className="font-mono text-[11px] text-slate">
          Place filters {docked ? "are docked in the sticky bar" : "are still in the hero"}.
        </p>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-charcoal/[0.08] bg-white"
          />
        ))}
      </div>
    </div>
  );
}
