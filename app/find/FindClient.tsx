"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listingDetailHref, westportParcelHref } from "@/lib/listing-url";

type LookupHit = {
  visionPid: string;
  addressFull: string;
  street: string;
  mblu: string | null;
  ownerName: string | null;
  listingId: string | null;
  mlsId: string | null;
  status: string | null;
  price: number | null;
  siblingCount: number;
};

type ApiResponse = {
  query: string;
  count: number;
  addresses: LookupHit[];
  error?: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function hitHref(hit: LookupHit): string {
  if (hit.visionPid) return westportParcelHref(hit.visionPid);
  if (hit.mlsId) {
    return listingDetailHref(hit.mlsId, hit.street, "Westport");
  }
  return "/find";
}

export default function FindClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<LookupHit[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LookupHit[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setHighlightIndex(-1);
      setResults([]);
      setSubmittedQuery("");
      setLoadState("idle");
      setError(null);
      return;
    }

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setSuggestLoading(true);
      setLoadState((prev) => (prev === "ready" ? "ready" : "loading"));
      setError(null);
      try {
        const params = new URLSearchParams({
          q,
          town: "Westport",
          limit: "16",
        });
        const res = await fetch(`/api/addresses/lookup?${params}`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as ApiResponse;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

        setSuggestions(data.addresses.slice(0, 10));
        setSuggestOpen(data.addresses.length > 0);
        setHighlightIndex(-1);
        setResults(data.addresses);
        setSubmittedQuery(q);
        setLoadState("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
        setSuggestOpen(false);
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed");
        setLoadState("error");
      } finally {
        if (!ac.signal.aborted) setSuggestLoading(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query]);

  function pickSuggestion(hit: LookupHit) {
    setSuggestOpen(false);
    inputRef.current?.blur();
    router.push(hitHref(hit));
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      setHighlightIndex(-1);
      return;
    }

    if (!suggestOpen || suggestions.length === 0) {
      if (e.key === "Enter" && results.length === 1) {
        e.preventDefault();
        pickSuggestion(results[0]!);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0) {
        pickSuggestion(suggestions[highlightIndex]!);
      } else if (suggestions.length === 1) {
        pickSuggestion(suggestions[0]!);
      } else {
        setSuggestOpen(false);
        inputRef.current?.blur();
      }
    }
  }

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Find · Westport
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Westport{" "}
            <span className="italic gold-shimmer">Lookup.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Type a street address. Matches come from the Westport parcel map —
            on-market and off-market. Streets not in GIS yet simply will not
            appear.
          </p>

          <div className="relative z-30 mt-6 flex flex-col sm:flex-row gap-3 max-w-2xl animate-fade-up-delay-2">
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
                  highlightIndex >= 0
                    ? `find-suggestion-${highlightIndex}`
                    : undefined
                }
                placeholder="Westport street address…"
                autoComplete="off"
                className="w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm text-white placeholder-white/35 focus:border-gold/50 focus:outline-none transition-colors"
              />
              {(suggestOpen || suggestLoading) && query.trim().length >= 2 && (
                <ul
                  id="find-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-navy/95 backdrop-blur-md shadow-2xl shadow-navy/40 py-1"
                >
                  {suggestLoading && suggestions.length === 0 && (
                    <li className="px-4 py-3 font-mono text-[11px] text-white/50">
                      Looking up Westport parcels…
                    </li>
                  )}
                  {suggestions.map((hit, i) => {
                    const meta = [
                      hit.status ?? "Off market",
                      hit.mblu ? `MBLU ${hit.mblu}` : null,
                      hit.siblingCount > 1
                        ? `${hit.siblingCount} parcels`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li
                        key={hit.visionPid || hit.mlsId || `${hit.street}-${i}`}
                        role="presentation"
                      >
                        <button
                          type="button"
                          id={`find-suggestion-${i}`}
                          role="option"
                          aria-selected={highlightIndex === i}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(hit)}
                          onMouseEnter={() => setHighlightIndex(i)}
                          className={`w-full px-4 py-3 text-left transition-colors ${
                            highlightIndex === i
                              ? "bg-gold/15"
                              : "hover:bg-white/5"
                          }`}
                        >
                          <span className="block text-sm font-medium text-white">
                            {hit.street}
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-3 font-mono text-[10px] text-white/45">
                            <span>{meta}</span>
                            <span className="text-gold tabular-nums shrink-0">
                              {fmtMoney(hit.price)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {loadState === "ready" && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
              {results.length} result{results.length === 1 ? "" : "s"}
              {submittedQuery ? ` for “${submittedQuery}”` : ""}
              {" · Westport"}
              {suggestLoading ? " · updating…" : ""}
            </p>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {loadState === "idle" && (
            <p className="text-charcoal/60 font-mono text-sm">
              Start typing a Westport address — on-market and off-market
              parcels appear as you type.
            </p>
          )}

          {loadState === "loading" && results.length === 0 && (
            <p className="text-charcoal/60 font-mono text-sm">Searching…</p>
          )}

          {loadState === "error" && error && (
            <p className="text-coral font-mono text-sm">{error}</p>
          )}

          {loadState === "ready" && results.length === 0 && (
            <p className="text-charcoal/60 font-mono text-sm">
              No Westport parcels matched
              {submittedQuery ? ` “${submittedQuery}”` : " your search"}. If
              the street is missing from GIS, it will not appear until the
              Vision fill includes it.
            </p>
          )}

          {results.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {results.map((hit, i) => (
                <FindCard
                  key={hit.visionPid || hit.mlsId || `${hit.street}-${i}`}
                  hit={hit}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function FindCard({ hit }: { hit: LookupHit }) {
  const status = hit.status ?? "Off market";
  const meta = [
    status,
    hit.mblu ? `MBLU ${hit.mblu}` : null,
    hit.ownerName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 transition-all hover:border-gold/30 hover:shadow-lg hover:shadow-navy/5">
      <Link
        href={hitHref(hit)}
        className="font-medium text-navy text-base leading-tight hover:text-gold transition-colors block"
      >
        {hit.street}
      </Link>
      <p className="text-sm text-slate mt-1">Westport, CT</p>
      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-slate/60 mt-2">
        {meta}
      </p>
      <div className="flex items-baseline justify-between gap-3 mt-4 pt-4 border-t border-charcoal/[0.06]">
        <span className="font-mono text-lg text-gold tabular-nums">
          {fmtMoney(hit.price)}
        </span>
        <span className="font-mono text-[10px] text-slate/60">
          {hit.listingId || hit.mlsId ? "On market" : "Off market"}
        </span>
      </div>
    </article>
  );
}
