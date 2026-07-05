"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import {
  formatTownList,
  resolveListingTown,
  TMRE_TOWNS,
  type TmreTown,
} from "@/lib/tmre-towns";
import { countListingsByTown } from "@/lib/town-listing-counts";
import TownFilterPills from "@/components/TownFilterPills";
import { listingDetailHref } from "@/lib/listing-url";
import { listingHoverHandlers, warmListingCache } from "@/lib/warm-listing-cache";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";

const FIND_TOWN_VALUES = ["All", ...TMRE_TOWNS] as const;

type FindListing = {
  mlsId: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    full: string;
  };
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  photoCount: number | null;
  status: string;
  pricePerSqft: number | null;
};

type ApiResponse = {
  query: string;
  count: number;
  listings: FindListing[];
  error?: string;
};

type TownFilter = "All" | TmreTown;
type LoadState = "idle" | "loading" | "ready" | "error";

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function FindClient() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [townFilter, setTownFilter] = usePersistedFilter<TownFilter>(
    "tmre_find_town",
    "All",
    FIND_TOWN_VALUES,
  );
  const [results, setResults] = useState<FindListing[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FindListing[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLUListElement>(null);
  const orderedTowns = usePersonalizedTowns(TMRE_TOWNS);

  const filtered = useMemo(() => {
    if (townFilter === "All") return results;
    return results.filter(
      (l) => l.address.city.toLowerCase() === townFilter.toLowerCase(),
    );
  }, [results, townFilter]);

  const townCounts = useMemo(() => {
    if (loadState !== "ready" || results.length === 0) return {};
    return countListingsByTown(results);
  }, [results, loadState]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setHighlightIndex(-1);
      return;
    }

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const params = new URLSearchParams({ q, limit: "8" });
        if (townFilter !== "All") params.set("city", townFilter);
        const res = await fetch(`/api/listings/find?${params}`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as ApiResponse;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSuggestions(data.listings);
        setSuggestOpen(data.listings.length > 0);
        setHighlightIndex(-1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
        setSuggestOpen(false);
      } finally {
        if (!ac.signal.aborted) setSuggestLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, townFilter]);

  async function runSearch(searchQuery?: string, e?: React.FormEvent) {
    e?.preventDefault();
    const q = (searchQuery ?? query).trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters to search.");
      setLoadState("error");
      return;
    }

    setSuggestOpen(false);
    setLoadState("loading");
    setError(null);
    setSubmittedQuery(q);
    if (searchQuery) setQuery(searchQuery);

    try {
      const params = new URLSearchParams({ q });
      if (townFilter !== "All") params.set("city", townFilter);
      const res = await fetch(`/api/listings/find?${params}`);
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults(data.listings);
      setLoadState("ready");
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed");
      setLoadState("error");
    }
  }

  function pickSuggestion(listing: FindListing) {
    const label = listing.address.street || listing.address.full;
    void runSearch(label);
    inputRef.current?.blur();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
      setHighlightIndex(-1);
    }
  }

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Find
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Search active{" "}
            <span className="italic gold-shimmer">listings.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Look up an address, street, MLS number, or zip across{" "}
            {formatTownList(TMRE_TOWNS)}.
          </p>

          <form
            onSubmit={(e) => runSearch(undefined, e)}
            className="relative z-30 mt-6 flex flex-col sm:flex-row gap-3 max-w-2xl animate-fade-up-delay-2"
          >
            <div className="relative z-30 flex-1 min-w-0">
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setSuggestOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => setSuggestOpen(false), 150);
                }}
                role="combobox"
                aria-expanded={suggestOpen}
                aria-autocomplete="list"
                aria-controls="find-suggestions"
                aria-activedescendant={
                  highlightIndex >= 0 ? `find-suggestion-${highlightIndex}` : undefined
                }
                placeholder="Address, street, MLS #, zip…"
                autoComplete="off"
                className="w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm text-white placeholder-white/35 focus:border-gold/50 focus:outline-none transition-colors"
              />
              {(suggestOpen || suggestLoading) && query.trim().length >= 2 && (
                <ul
                  ref={suggestRef}
                  id="find-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-navy/95 backdrop-blur-md shadow-2xl shadow-navy/40 py-1"
                >
                  {suggestLoading && suggestions.length === 0 && (
                    <li className="px-4 py-3 font-mono text-[11px] text-white/50">
                      Looking up listings…
                    </li>
                  )}
                  {suggestions.map((l, i) => {
                    const line = l.address.street || l.address.full;
                    const meta = [l.address.city, l.address.postalCode].filter(Boolean).join(" ");
                    return (
                      <li key={l.mlsId} role="presentation">
                        <button
                          type="button"
                          id={`find-suggestion-${i}`}
                          role="option"
                          aria-selected={highlightIndex === i}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(l)}
                          onMouseEnter={() => {
                            setHighlightIndex(i);
                            warmListingCache(l.mlsId);
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors ${
                            highlightIndex === i ? "bg-gold/15" : "hover:bg-white/5"
                          }`}
                        >
                          <span className="block text-sm font-medium text-white">{line}</span>
                          <span className="mt-0.5 flex items-center justify-between gap-3 font-mono text-[10px] text-white/45">
                            <span>{meta}</span>
                            <span className="text-gold tabular-nums shrink-0">{fmtMoney(l.price)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={loadState === "loading"}
              className="rounded-full bg-gold px-7 py-3 text-sm font-medium text-navy whitespace-nowrap transition-all hover:bg-gold-light disabled:opacity-60"
            >
              {loadState === "loading" ? "Searching…" : "Search →"}
            </button>
          </form>

          <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 animate-fade-up-delay-2">
            <TownFilterPills
              towns={orderedTowns}
              selected={townFilter}
              onSelect={setTownFilter}
              counts={townCounts}
            />
          </div>

          {loadState === "ready" && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
              {submittedQuery ? ` for “${submittedQuery}”` : ""}
              {townFilter !== "All" ? ` in ${townFilter}` : ""}
            </p>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {loadState === "idle" && (
            <p className="text-charcoal/60 font-mono text-sm">
              Enter an address or MLS number above to search active inventory.
            </p>
          )}

          {loadState === "error" && error && (
            <p className="text-coral font-mono text-sm">{error}</p>
          )}

          {loadState === "ready" && filtered.length === 0 && (
            <p className="text-charcoal/60 font-mono text-sm">
              No active listings matched
              {submittedQuery ? ` “${submittedQuery}”` : " your search"}
              {townFilter !== "All" ? ` in ${townFilter}` : ""}.
            </p>
          )}

          {filtered.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {filtered.map((l) => (
                <FindCard key={l.mlsId} listing={l} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function FindCard({ listing: l }: { listing: FindListing }) {
  const typeLine = [
    l.propertyType.replace(/ For (Sale|Lease)$/i, ""),
    l.beds && l.baths ? `${l.beds}BR/${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      {...listingHoverHandlers(l.mlsId)}
      className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 transition-all hover:border-gold/30 hover:shadow-lg hover:shadow-navy/5"
    >
      <Link
        href={listingDetailHref(
          l.mlsId,
          l.address.street || l.address.full,
          resolveListingTown(l.address.city) || l.address.city,
        )}
        className="font-medium text-navy text-base leading-tight hover:text-gold transition-colors block"
      >
        {l.address.street || l.address.full}
      </Link>
      <p className="text-sm text-slate mt-1">
        {[l.address.city, l.address.state, l.address.postalCode].filter(Boolean).join(" ")}
      </p>
      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-slate/60 mt-2">
        {typeLine}
      </p>
      <div className="flex items-baseline justify-between gap-3 mt-4 pt-4 border-t border-charcoal/[0.06]">
        <span className="font-mono text-lg text-gold tabular-nums">{fmtMoney(l.price)}</span>
        {l.dom != null && (
          <span className="font-mono text-[10px] text-slate/60">{l.dom}d on market</span>
        )}
      </div>
    </article>
  );
}
