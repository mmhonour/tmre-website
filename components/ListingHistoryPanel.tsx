"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/listing-history";
import { listingDetailHref, listingHistoryHref } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { loadTabJson, peekTabJson } from "@/lib/tab-data-prefetch";

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
  isRental?: boolean;
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
  variant?: "panel" | "page" | "modal";
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (townHint?.trim()) params.set("town", townHint.trim());
    const qs = params.toString();
    const url = `/api/listings/${encodeURIComponent(mlsId)}/history${
      qs ? `?${qs}` : ""
    }`;

    const cached = peekTabJson<HistoryResponse>(url);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadTabJson<HistoryResponse>(url)
      .then((d) => {
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
  const isModal = variant === "modal";

  if (loading) {
    return (
      <div
        className={
          isPage
            ? "max-w-2xl"
            : isModal
              ? ""
              : "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
        }
      >
        {!isPage && !isModal && (
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            Listing history
          </p>
        )}
        <p
          className={`font-mono text-[10px] tracking-[0.15em] uppercase ${
            isModal ? "text-slate" : "text-white/40"
          }`}
        >
          Loading…
        </p>
      </div>
    );
  }

  if (!hasContent && !isPage && !isModal) return null;

  const wrapperClass = isPage
    ? "max-w-2xl space-y-6"
    : isModal
      ? "space-y-5"
      : "rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-5";

  const dateClass = isModal
    ? "font-mono text-[10px] text-slate shrink-0 w-24 pt-0.5"
    : "font-mono text-[10px] text-white/40 shrink-0 w-24 pt-0.5";
  const labelClass = isModal ? "text-charcoal" : "text-white/85";
  const detailClass = isModal ? "block text-slate text-xs mt-0.5" : "block text-white/55 text-xs mt-0.5";
  const sectionTitleClass = isModal
    ? "font-mono text-[10px] tracking-[0.15em] uppercase text-slate mb-3"
    : "font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mb-3";

  return (
    <div className={wrapperClass}>
      {!isPage && !isModal && (
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

      {isModal && (
        <p className="text-sm text-slate leading-relaxed">
          Price changes, status updates, and prior MLS listings at this address.
        </p>
      )}

      {!hasContent && (isPage || isModal) && (
        <div
          className={
            isModal
              ? "rounded-2xl border border-charcoal/[0.08] bg-cream/60 p-6 text-center"
              : "rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"
          }
        >
          <p className={isModal ? "text-charcoal text-sm" : "text-white/60 text-sm"}>
            No listing history on record yet for this property.
          </p>
          <p className={isModal ? "text-slate text-xs mt-2" : "text-white/40 text-xs mt-2"}>
            History builds from MLS feed data and prior listings in the local cache.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div
          className={
            isPage
              ? "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              : isModal
                ? "rounded-2xl border border-charcoal/[0.08] bg-cream/40 p-4"
                : ""
          }
        >
          {(isPage || isModal) && (
            <p className={sectionTitleClass}>This listing</p>
          )}
          <ul className="space-y-3">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className={dateClass}>{fmtDate(ev.date) ?? "—"}</span>
                <span className={labelClass}>
                  {ev.label}
                  {ev.detail && <span className={detailClass}>{ev.detail}</span>}
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
              : isModal
                ? "rounded-2xl border border-charcoal/[0.08] bg-cream/40 p-4"
                : "border-t border-white/10 pt-5"
          }
        >
          <p className={sectionTitleClass}>Previous listings at this address</p>
          <ul className="space-y-3">
            {prior.map((p) => (
              <li
                key={p.mlsId}
                {...listingHoverHandlers(p.mlsId)}
                className={`text-sm ${
                  isModal
                    ? "border-t border-charcoal/[0.06] pt-3 first:border-0 first:pt-0"
                    : "border-t border-white/[0.06] pt-3 first:border-0 first:pt-0"
                }`}
              >
                <Link
                  href={listingDetailHref(p.mlsId, undefined, town)}
                  className={
                    isModal
                      ? "text-navy hover:text-gold transition-colors font-mono text-xs"
                      : "text-gold hover:text-white transition-colors font-mono text-xs"
                  }
                >
                  #{p.mlsId}
                </Link>
                <Link
                  href={listingHistoryHref(p.mlsId, undefined, town)}
                  className={
                    isModal
                      ? "text-slate hover:text-gold transition-colors font-mono text-[10px] ml-2 uppercase tracking-wider"
                      : "text-white/45 hover:text-gold transition-colors font-mono text-[10px] ml-2 uppercase tracking-wider"
                  }
                >
                  History →
                </Link>
                <span className={isModal ? "text-charcoal ml-2" : "text-white/85 ml-2"}>
                  {p.status}
                </span>
                <span className={isModal ? "block text-slate text-xs mt-1" : "block text-white/50 text-xs mt-1"}>
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
