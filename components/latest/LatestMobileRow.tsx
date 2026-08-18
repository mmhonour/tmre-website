"use client";

import { memo } from "react";
import {
  bedBathLabel,
  dealBoardAcresLabel,
  DealBoardPrimaryPhoto,
  DealBoardStatusBadge,
  listingDetailHref,
} from "@/components/intelligence/deal-board/deal-board-shared";
import { useCurrentReturnPath } from "@/components/listing/ListingReturnLink";
import type { LatestListingRow } from "@/lib/latest-listings";
import { latestRowActivityIso } from "@/lib/latest-activity";
import { formatPriceChangeLabel } from "@/lib/listing-price-change";
import { mlsTimestampMs } from "@/lib/mls-time";
import { normalizeTownName, townHasMultipleZips } from "@/lib/tmre-towns";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import ClickableGoldilocksScore from "@/components/ClickableGoldilocksScore";
import LatestAddressMetaHover from "@/components/latest/LatestAddressMetaHover";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMobileClosedDate(iso: string | null): { label: string; title: string } {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return { label: "—", title: "Closed —" };
  const date = new Date(t);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  const day = date.getDate();
  const label = `${weekday} ${month} ${day}`;
  return { label, title: `Closed ${label}` };
}

function formatMobileUpdatedAt(iso: string | null): { label: string; title: string } {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return { label: "—", title: "MLS updated —" };
  const date = new Date(t);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const today = new Date();
  if (isSameLocalDay(date, today)) {
    return { label: time, title: `MLS updated ${time} (your local time)` };
  }
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  const day = date.getDate();
  const label = `${weekday} ${month} ${day} · ${time}`;
  return { label, title: `MLS updated ${label} (your local time)` };
}

function displayTown(l: LatestListingRow): string | null {
  const raw = l.town?.trim() || l.city?.trim();
  if (!raw) return null;
  return normalizeTownName(raw);
}

type LatestMobileRowProps = {
  listing: LatestListingRow;
  isLive: boolean;
  isNew?: boolean;
  hideTown?: boolean;
  hideZip?: boolean;
  showZipMap?: boolean;
  showStatus?: boolean;
  dateOnlyClock?: boolean;
};

/**
 * Phone-first Latest feed row — photo + stacked meta (not the desktop table line).
 */
function LatestMobileRow({
  listing: l,
  isLive,
  isNew = false,
  hideTown = false,
  hideZip = false,
  showZipMap = false,
  showStatus = true,
  dateOnlyClock = false,
}: LatestMobileRowProps) {
  const town = hideTown ? null : displayTown(l);
  const listingTownName = l.town?.trim() || l.city?.trim() || null;
  const showZip =
    Boolean(l.zip) &&
    !hideZip &&
    (showZipMap || townHasMultipleZips(listingTownName));
  const returnPath = useCurrentReturnPath();
  const detailHref = listingDetailHref(l, returnPath);
  const clockIso = latestRowActivityIso(l);
  const updatedAt = dateOnlyClock
    ? formatMobileClosedDate(clockIso)
    : formatMobileUpdatedAt(clockIso);
  const ppsf =
    !l.isRental && l.pricePerSqft != null
      ? `$${Math.round(l.pricePerSqft)}/sf`
      : null;
  const bedBath = bedBathLabel(l.beds, l.baths);
  const acres = dealBoardAcresLabel(l.lotAcres);
  const specsLabel = [bedBath, ppsf, acres].filter(Boolean).join(" · ");
  const priceLabel = `$${l.price.toLocaleString()}`;
  const priceChangeLabel =
    l.priceChange &&
    (l.status === "Reduced" || l.status === "Increased")
      ? formatPriceChangeLabel(l.priceChange)
      : null;
  const priceChangeClass =
    l.priceChange?.direction === "increased"
      ? "text-sky"
      : l.priceChange?.direction === "reduced"
        ? "text-coral"
        : "text-slate";

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className={`flex items-start gap-3 px-3 py-2.5 border-b border-charcoal/[0.08] last:border-0 ${
        isNew ? "bg-sage/[0.06] animate-[fadeIn_0.4s_ease-out]" : ""
      }`}
    >
      <div className="flex w-[6rem] shrink-0 flex-col gap-1">
        <span
          className="font-mono text-[10px] tabular-nums leading-snug text-navy/70 truncate"
          title={updatedAt.title}
        >
          {updatedAt.label}
        </span>
        <DealBoardPrimaryPhoto
          listing={l}
          isLive={isLive}
          width={96}
          height={72}
          priority
          surface="light"
          className="rounded-lg shrink-0"
          showPhotoCountBadge={false}
        />
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-mono text-[13px] tabular-nums font-semibold leading-tight text-navy">
            {priceLabel}
          </span>
          {priceChangeLabel ? (
            <span
              className={`font-mono text-[10px] tabular-nums leading-tight ${priceChangeClass}`}
              title={
                l.priceChange
                  ? `Was $${l.priceChange.previousPrice.toLocaleString()}`
                  : undefined
              }
            >
              {priceChangeLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        {/* Address top-aligned with timestamp; wraps before the status pill. */}
        <div className="flex min-w-0 items-start gap-2">
          <LatestAddressMetaHover
            listing={l}
            href={detailHref}
            isLive={isLive}
            wrapperClassName="min-w-0 flex-1"
            className="block min-w-0 whitespace-normal break-words text-[15px] font-medium leading-snug text-navy underline decoration-charcoal/15 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
          >
            {l.address}
          </LatestAddressMetaHover>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {showStatus ? <DealBoardStatusBadge status={l.status} /> : null}
            <ClickableGoldilocksScore
              score={l.score}
              breakdown={l.scoreBreakdown}
              title={l.address}
              subtitle={[town, l.zip].filter(Boolean).join(" · ") || null}
              listingHref={detailHref}
              isRental={l.isRental}
              variant="pill"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {town ? (
            <LatestTownMapHover
              townName={town}
              className="font-mono text-[10px] tracking-[0.1em] uppercase font-semibold text-gold"
            />
          ) : null}
          {showZip && l.zip ? (
            <LatestZipMapHover
              zip={l.zip}
              townName={listingTownName}
              className="font-mono text-[11px] tabular-nums text-slate/70"
            />
          ) : null}
        </div>

        {specsLabel ? (
          <span className="font-mono text-[11px] tabular-nums text-slate truncate">
            {specsLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default memo(LatestMobileRow);
