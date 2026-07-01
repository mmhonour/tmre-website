"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clearLookedAtListings,
  readLookedAtListings,
  type LookedAtEntry,
} from "@/lib/looked-at-listings";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortType(propertyType: string | null): string {
  if (!propertyType) return "Listing";
  const t = propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
  if (/single family/i.test(t)) return "SFR";
  if (/condo|co-op/i.test(t)) return "Condo";
  if (/multi/i.test(t)) return "Multi";
  if (/rental/i.test(t)) return "Rental";
  return t;
}

export default function LookeyClient() {
  const [entries, setEntries] = useState<LookedAtEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const refresh = () => setEntries(readLookedAtListings());
    refresh();
    setHydrated(true);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const orderedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt),
      ),
    [entries],
  );

  const handleClear = () => {
    clearLookedAtListings();
    setEntries([]);
  };

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
            recent views, newest first.
          </p>
          {orderedEntries.length > 0 && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
              {orderedEntries.length}{" "}
              {orderedEntries.length === 1 ? "property" : "properties"} saved
            </p>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {!hydrated ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-charcoal/[0.06] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[16/10] bg-charcoal/[0.06]" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-charcoal/[0.06] rounded w-3/4" />
                    <div className="h-3 bg-charcoal/[0.04] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : orderedEntries.length === 0 ? (
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
            <div className="relative rounded-2xl border border-charcoal/[0.08] bg-white p-5 lg:p-8">
              <button
                type="button"
                onClick={handleClear}
                className="absolute top-5 right-5 lg:top-8 lg:right-8 font-mono text-[10px] tracking-[0.15em] uppercase text-coral/60 hover:text-coral transition-colors z-10"
              >
                Clear history
              </button>
              <div className="grid grid-flow-row grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 pt-10">
                {orderedEntries.map((entry) => (
                  <LookeyCard key={entry.id} entry={entry} />
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-charcoal/[0.06]">
                <Link
                  href="/intelligence"
                  className="font-mono text-[11px] tracking-[0.15em] uppercase text-navy/60 hover:text-gold transition-colors"
                >
                  ← Back to Intelligence
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function useListingPreviewPhoto(mlsId: string): {
  photo: string | null;
  failed: boolean;
  setFailed: (failed: boolean) => void;
} {
  const [photo, setPhoto] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mlsId || mlsId === "—") return;
    let cancelled = false;
    setFailed(false);
    setPhoto(null);

    fetch(`/api/listings/${encodeURIComponent(mlsId)}/photo`, { cache: "default" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => {
        if (cancelled) return;
        if (d?.url) {
          setPhoto(d.url);
          return;
        }
        setPhoto(listingPhotoProxyUrl(mlsId, 0));
      })
      .catch(() => {
        if (!cancelled) setPhoto(listingPhotoProxyUrl(mlsId, 0));
      });

    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  return { photo, failed, setFailed };
}

function LookeyCard({ entry }: { entry: LookedAtEntry }) {
  const { photo, failed, setFailed } = useListingPreviewPhoto(entry.id);
  const showPhoto = photo && !failed;

  return (
    <article className="rounded-2xl bg-white border border-charcoal/[0.08] hover:border-gold/30 hover:shadow-lg hover:shadow-navy/5 transition-all overflow-hidden flex flex-col">
      <Link
        href={entry.href}
        className="relative block aspect-[16/10] bg-cream border-b border-charcoal/[0.06] shrink-0"
        aria-label={`View listing: ${entry.address}`}
      >
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-cream">
            <svg
              className="w-8 h-8 text-navy/15"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
        )}
      </Link>

      <div className="p-5 lg:p-6 flex flex-col gap-3 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={entry.href}
            className="font-medium text-navy text-base leading-tight hover:text-gold transition-colors block"
          >
            {entry.address}
          </Link>
          <p className="font-mono text-[10px] tracking-[0.1em] text-slate/60 mt-0.5">
            {[entry.city, entry.zip].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/50 whitespace-nowrap shrink-0">
          {timeAgo(entry.viewedAt)}
        </span>
      </div>

      <div className="pt-3 border-t border-charcoal/[0.06]">
        <Link
          href={entry.href}
          className="inline-block font-mono tabular-nums text-navy font-medium text-base hover:text-gold transition-colors"
        >
          {entry.price != null ? fmtMoney(entry.price) : "—"}
        </Link>
        <p className="font-mono text-[10px] text-slate/60 mt-0.5">
          {shortType(entry.propertyType)}
        </p>
      </div>
      </div>
    </article>
  );
}
