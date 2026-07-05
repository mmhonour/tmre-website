"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingDetailHrefForListing, listingPhotoProxyUrl, listingPhotosHref } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import type { DealBoardListing, DealBoardRowStatus } from "@/components/intelligence/deal-board/deal-board-types";
import { normalizeTownName } from "@/lib/tmre-towns";

export function boardRankColor(scoreRank: number, total: number): string {
  if (total <= 1) return "#b8954a";
  const t = scoreRank / (total - 1);
  if (t <= 0.2) return "#3d7a5a";
  if (t <= 0.45) return "#b8954a";
  if (t <= 0.7) return "#8a8f98";
  return "#c4c8ce";
}

export function listingTown(l: DealBoardListing): string | null {
  return l.city ? normalizeTownName(l.city) : null;
}

export function bedBathLabel(beds: number | null | undefined, baths: number | null | undefined): string {
  const b = beds != null ? `${beds}bd` : "—bd";
  const ba = baths != null ? `${baths}ba` : "—ba";
  return `${b} · ${ba}`;
}

export function dealBoardYearBuiltLabel(
  yearBuilt: number | null | undefined,
): string | null {
  return yearBuilt != null ? `Built in ${yearBuilt}` : null;
}

export function dealBoardSqftLabel(
  sqft: number | null | undefined,
): string | null {
  return sqft != null ? `${sqft.toLocaleString()} sf` : null;
}

export function dealBoardSqftYearLabel(
  sqft: number | null | undefined,
  yearBuilt: number | null | undefined,
  lotAcres?: number | null,
): string | null {
  return buildDealBoardAdaptiveMetaText([], sqft, yearBuilt, lotAcres, false);
}

function buildDealBoardAdaptiveMetaText(
  prefixParts: (string | null | undefined)[],
  sqft: number | null | undefined,
  yearBuilt: number | null | undefined,
  lotAcres: number | null | undefined,
  yearCompact: boolean,
): string | null {
  const sqftAcresYear = [
    dealBoardSqftLabel(sqft),
    dealBoardAcresLabel(lotAcres),
    yearBuilt != null
      ? yearCompact
        ? String(yearBuilt)
        : `Built in ${yearBuilt}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const all = [...prefixParts.filter(Boolean), sqftAcresYear || null].filter(
    Boolean,
  ) as string[];
  return all.length > 0 ? all.join(" · ") : null;
}

function measureElementTextWidth(text: string, el: HTMLElement): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 6;
  const style = getComputedStyle(el);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText(text).width;
}

export function DealBoardAdaptiveMetaLine({
  parts = [],
  sqft,
  yearBuilt,
  lotAcres,
  className,
  as: Tag = "p",
}: {
  parts?: (string | null | undefined)[];
  sqft: number | null | undefined;
  yearBuilt?: number | null;
  lotAcres?: number | null;
  className?: string;
  as?: "p" | "span";
}) {
  const ref = useRef<HTMLElement>(null);
  const [yearCompact, setYearCompact] = useState(false);
  const partsKey = useMemo(
    () => parts.filter(Boolean).join("\0"),
    [parts],
  );

  const text = useMemo(
    () =>
      buildDealBoardAdaptiveMetaText(
        parts,
        sqft,
        yearBuilt ?? null,
        lotAcres ?? null,
        yearCompact,
      ),
    [parts, partsKey, sqft, yearBuilt, lotAcres, yearCompact],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || yearBuilt == null) {
      setYearCompact(false);
      return;
    }

    const sync = () => {
      const full = buildDealBoardAdaptiveMetaText(
        parts,
        sqft,
        yearBuilt,
        lotAcres ?? null,
        false,
      );
      if (!full) {
        setYearCompact(false);
        return;
      }
      const width = el.clientWidth;
      if (width <= 0) return;
      setYearCompact(measureElementTextWidth(full, el) > width);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [partsKey, sqft, yearBuilt, lotAcres]);

  if (!text) return null;

  return (
    <Tag ref={ref as never} className={className}>
      {text}
    </Tag>
  );
}

export function dealBoardAcresLabel(
  lotAcres: number | null | undefined,
): string | null {
  if (lotAcres == null || lotAcres <= 0) return null;
  if (lotAcres < 0.01) return "<0.01 ac";
  if (lotAcres < 10) return `${lotAcres.toFixed(2)} ac`;
  return `${lotAcres.toFixed(1)} ac`;
}

/** DOM followed by property type, e.g. "12d DOM · SFR". */
export function dealBoardDomWithType(
  dom: number | null | undefined,
  type: string,
): string {
  const parts: string[] = [];
  if (dom != null) parts.push(`${dom}d DOM`);
  if (type) parts.push(type);
  return parts.join(" · ");
}

export function listingDetailHref(l: DealBoardListing): string {
  return listingDetailHrefForListing({
    mlsId: l.key,
    listingKey: l.listingKey,
    address: { street: l.address, full: l.address },
    city: l.city,
  });
}

export function DealBoardAddressWithInsight({
  listing,
  isLive,
  showAddress = true,
  addressClassName = "font-medium text-navy text-sm leading-snug hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold truncate",
}: {
  listing: DealBoardListing;
  isLive: boolean;
  showAddress?: boolean;
  addressClassName?: string;
}) {
  if (!showAddress) {
    if (!listing.headline) return null;
    return (
      <p className="text-[11px] text-charcoal/60 italic leading-snug line-clamp-2 pt-0.5">
        {listing.headline}
      </p>
    );
  }

  const detailHref = listingDetailHref(listing);
  const addressEl = isLive ? (
    <Link href={detailHref} className={addressClassName}>
      {listing.address}
    </Link>
  ) : (
    <span className="font-medium text-navy text-sm leading-snug truncate">
      {listing.address}
    </span>
  );

  return (
    <div className="flex items-baseline gap-x-2 min-w-0">
      <div className="min-w-0 truncate">{addressEl}</div>
      {listing.headline ? (
        <span className="text-[11px] text-charcoal/60 italic leading-snug shrink-0">
          {listing.headline}
        </span>
      ) : null}
    </div>
  );
}

export function dealBoardScoreTextColor(value: number): string {
  if (value >= 85) return "text-sage";
  if (value >= 70) return "text-gold";
  return "text-charcoal/50";
}

function dealBoardScorePillClasses(value: number): string {
  if (value >= 85) {
    return `${dealBoardScoreTextColor(value)} border-sage/30 bg-gradient-to-br from-sage/30 via-sage/18 to-sage/8`;
  }
  if (value >= 70) {
    return `${dealBoardScoreTextColor(value)} border-gold/35 bg-gradient-to-br from-gold/35 via-gold/20 to-gold/10`;
  }
  return `${dealBoardScoreTextColor(value)} border-charcoal/20 bg-gradient-to-br from-charcoal/18 via-charcoal/12 to-charcoal/5`;
}

export function DealBoardScoreBadge({
  value,
  onClick,
  variant = "text",
}: {
  value: number;
  onClick?: () => void;
  variant?: "text" | "pill";
}) {
  if (variant === "pill") {
    const className = `inline-flex m-0 h-auto min-h-0 shrink-0 items-center justify-center rounded-full border px-2.5 py-px font-mono text-xs font-semibold leading-none tabular-nums ${dealBoardScorePillClasses(value)} ${
      onClick
        ? "cursor-pointer hover:brightness-95 active:brightness-90 transition-all"
        : ""
    }`;
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          className={className}
          aria-label={`Score ${value.toFixed(1)} — view breakdown`}
        >
          {value.toFixed(1)}
        </button>
      );
    }
    return <span className={className}>{value.toFixed(1)}</span>;
  }

  const color = dealBoardScoreTextColor(value);
  const className = `font-mono font-semibold tabular-nums text-base ${color} ${
    onClick
      ? "underline underline-offset-2 decoration-charcoal/20 hover:decoration-gold transition-colors cursor-pointer"
      : ""
  }`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={`Score ${value.toFixed(1)} — view breakdown`}
      >
        {value.toFixed(1)}
      </button>
    );
  }
  return <span className={className}>{value.toFixed(1)}</span>;
}

export function DealBoardStatusBadge({
  status,
  onClick,
}: {
  status: DealBoardRowStatus | string;
  onClick?: () => void;
}) {
  const map: Record<string, string> = {
    New: "bg-sage/10 text-sage border-sage/30",
    Active: "bg-sky/10 text-sky border-sky/30",
    Reduced: "bg-coral/10 text-coral border-coral/30",
    Pending: "bg-charcoal/10 text-slate border-charcoal/20",
  };
  const className = `inline-flex w-fit self-start items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2.5 py-1 ${
    map[status] ?? "bg-charcoal/10 text-slate border-charcoal/20"
  } ${onClick ? "cursor-pointer hover:brightness-110 transition-all" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {status}
      </button>
    );
  }
  return <span className={className}>{status}</span>;
}

export function DealBoardPrimaryPhoto({
  listing,
  isLive,
  width,
  height,
  priority = false,
  className = "rounded-lg",
  photoIndex = 0,
  fluid = false,
}: {
  listing: DealBoardListing;
  isLive: boolean;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  photoIndex?: number;
  /** Fill container width; width/height set aspect ratio. */
  fluid?: boolean;
}) {
  const href = isLive
    ? listingPhotosHref(listing.key, listing.address, listing.city, photoIndex)
    : null;
  const src = isLive ? listingPhotoProxyUrl(listing.key, photoIndex) : null;

  const image = src ? (
    <ListingThumbImage
      src={src}
      priority={priority}
      className="absolute inset-0 block h-full w-full"
      imgClassName="absolute inset-0 h-full w-full object-cover"
    />
  ) : (
    <div className="absolute inset-0 bg-gradient-to-br from-charcoal/10 to-cream" />
  );

  const badge =
    listing.photoCount != null && listing.photoCount > 1 ? (
      <span className="absolute bottom-1.5 right-1.5 font-mono text-[8px] tracking-wide text-white bg-black/60 rounded px-1 py-px">
        +{listing.photoCount - 1}
      </span>
    ) : null;

  const shell = (
    <div
      className={`relative overflow-hidden bg-charcoal/10 shadow-md ${
        fluid ? "w-full" : "shrink-0"
      } ${className}`}
      style={
        fluid
          ? { aspectRatio: `${width} / ${height}` }
          : { width, height }
      }
    >
      {image}
      {badge}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className={`block ${fluid ? "w-full" : "shrink-0"}`}
        aria-label={`View photos for ${listing.address}`}
        {...listingHoverHandlers(listing.key)}
      >
        {shell}
      </Link>
    );
  }

  return shell;
}
