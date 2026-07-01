"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/listing-history";
import { listingDetailHref, listingHistoryHref } from "@/lib/listing-url";

type HistoryEvent = {
  date: string | null;
  label: string;
  detail?: string;
};

type PriorListing = {
  mlsId: string;
  status: string;
  listDate: string | null;
  price: number | null;
  originalListPrice: number | null;
  closeDate: string | null;
  closePrice: number | null;
};

type HistoryResponse = {
  events: HistoryEvent[];
  priorListings: PriorListing[];
  town: string | null;
};

export default function ListingHistoryPanel({
  mlsId,
  townHint,
  variant = "panel",
}: {
  mlsId: string;
  townHint?: string | null;
  variant?: "panel" | "page";
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (townHint?.trim()) params.set("town", townHint.trim());
    const qs = params.toString();

    fetch(
      `/api/listings/${encodeURIComponent(mlsId)}/history${qs ? `?${qs}` : ""}`,
      { cache: "default" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HistoryResponse | null) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mlsId, townHint]);

  const events = data?.events ?? [];
  const prior = data?.priorListings ?? [];
  const town = data?.town ?? townHint ?? null;
  const hasContent = events.length > 0 || prior.length > 0;
  const isPage = variant === "page";

  if (loading) {
    return (
      <div
        className={
          isPage
            ? "max-w-2xl"
            : "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
        }
      >
        {!isPage && (
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            Listing history
          </p>
        )}
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
          Loading…
        </p>
      </div>
    );
  }

  if (!hasContent && !isPage) return null;

  const wrapperClass = isPage
    ? "max-w-2xl space-y-6"
    : "rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-5";

  return (
    <div className={wrapperClass}>
      {!isPage && (
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
            Listing history
          </p>
          <p className="text-white/50 text-xs">MLS timeline for this listing</p>
        </div>
      )}

      {isPage && (
        <p className="text-white/50 text-sm">
          Price changes, status updates, and prior MLS listings at this address.
        </p>
      )}

      {!hasContent && isPage && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <p className="text-white/60 text-sm">
            No listing history on record yet for this property.
          </p>
          <p className="text-white/40 text-xs mt-2">
            History builds from MLS feed data and prior listings in the local cache.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div className={isPage ? "rounded-2xl border border-white/10 bg-white/[0.04] p-6" : ""}>
          {isPage && (
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mb-4">
              This listing
            </p>
          )}
          <ul className="space-y-3">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono text-[10px] text-white/40 shrink-0 w-24 pt-0.5">
                  {fmtDate(ev.date) ?? "—"}
                </span>
                <span className="text-white/85">
                  {ev.label}
                  {ev.detail && (
                    <span className="block text-white/55 text-xs mt-0.5">
                      {ev.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {prior.length > 0 && (
        <div
          className={
            isPage
              ? "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              : "border-t border-white/10 pt-5"
          }
        >
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mb-3">
            Previous listings at this address
          </p>
          <ul className="space-y-3">
            {prior.map((p) => (
              <li
                key={p.mlsId}
                className="text-sm border-t border-white/[0.06] pt-3 first:border-0 first:pt-0"
              >
                <Link
                  href={listingDetailHref(p.mlsId, undefined, town)}
                  className="text-gold hover:text-white transition-colors font-mono text-xs"
                >
                  #{p.mlsId}
                </Link>
                <Link
                  href={listingHistoryHref(p.mlsId, undefined, town)}
                  className="text-white/45 hover:text-gold transition-colors font-mono text-[10px] ml-2 uppercase tracking-wider"
                >
                  History →
                </Link>
                <span className="text-white/85 ml-2">{p.status}</span>
                <span className="block text-white/50 text-xs mt-1">
                  {[
                    p.listDate ? `Listed ${fmtDate(p.listDate)}` : null,
                    p.closeDate
                      ? `Closed ${fmtDate(p.closeDate)}`
                      : p.price
                        ? fmtMoney(p.price)
                        : null,
                    p.closePrice ? `Sold ${fmtMoney(p.closePrice)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
