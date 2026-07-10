"use client";

import { memo } from "react";
import {
  bedBathLabel,
  dealBoardAcresLabel,
  DealBoardPrimaryPhoto,
  DealBoardStatusBadge,
  listingDetailHref,
} from "@/components/intelligence/deal-board/deal-board-shared";
import type { LatestListingRow } from "@/lib/latest-listings";
import { mlsTimestampMs } from "@/lib/mls-time";
import { normalizeTownName, townHasMultipleZips } from "@/lib/tmre-towns";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import LatestAddressMetaHover from "@/components/latest/LatestAddressMetaHover";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";

function formatUpdatedAt(iso: string | null): string {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return "—";
  // H:NN AM/PM (e.g. "1:00 PM", not "01:00 PM"). Column width stays fixed via CSS.
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

function displayTown(l: LatestListingRow): string | null {
  const raw = l.town?.trim() || l.city?.trim();
  if (!raw) return null;
  return normalizeTownName(raw);
}

type LatestLineRowProps = {
  listing: LatestListingRow;
  isLive: boolean;
  isNew?: boolean;
  hideTown?: boolean;
  /** Show zip map hover whenever a zip is present (e.g. zip-grouped feed). */
  showZipMap?: boolean;
};

function LatestLineRow({
  listing: l,
  isLive,
  isNew = false,
  hideTown = false,
  showZipMap = false,
}: LatestLineRowProps) {
  const town = hideTown ? null : displayTown(l);
  const listingTownName = l.town?.trim() || l.city?.trim() || null;
  const showZip =
    Boolean(l.zip) && (showZipMap || townHasMultipleZips(listingTownName));
  const detailHref = listingDetailHref(l);
  const updatedLabel = formatUpdatedAt(l.modificationTimestamp);
  const scoreColor =
    l.score >= 85 ? "text-sage" : l.score >= 70 ? "text-gold" : "text-charcoal/50";
  const ppsf =
    !l.isRental && l.pricePerSqft != null
      ? `$${Math.round(l.pricePerSqft)}/sf`
      : null;

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors text-[13px] leading-none ${
        isNew ? "bg-sage/[0.06] animate-[fadeIn_0.4s_ease-out]" : ""
      }`}
    >
      <span
        className="box-border flex items-center justify-end w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] shrink-0 grow-0 overflow-hidden leading-tight"
        title={`MLS updated ${updatedLabel} (your local time)`}
      >
        <span className="font-mono text-[11px] sm:text-[12px] tabular-nums text-navy whitespace-nowrap">
          {updatedLabel}
        </span>
      </span>
      <DealBoardPrimaryPhoto
        listing={l}
        isLive={isLive}
        width={53}
        height={36}
        priority
        surface="light"
        className="rounded-md shrink-0"
        showPhotoCountBadge={false}
      />
      <span className={`shrink-0 font-mono text-[13px] font-semibold tabular-nums ${scoreColor}`}>
        {l.score.toFixed(1)}
      </span>
      {town ? (
        <LatestTownMapHover
          townName={town}
          className="shrink-0 font-mono text-[11px] tracking-[0.08em] uppercase text-gold font-semibold"
        />
      ) : null}
      <span className="text-charcoal/25 shrink-0" aria-hidden>·</span>
      <span className="flex min-w-0 max-w-[40%] items-center gap-1.5">
        <LatestAddressMetaHover listing={l} href={detailHref} isLive={isLive}>
          {l.address}
        </LatestAddressMetaHover>
        {showZip && l.zip ? (
          <LatestZipMapHover
            zip={l.zip}
            townName={listingTownName}
            className="shrink-0 font-mono text-[11px] tabular-nums text-slate/70"
          />
        ) : null}
      </span>
      <span className="text-charcoal/25 shrink-0" aria-hidden>·</span>
      <span className="min-w-0 flex-1 truncate text-center font-mono text-slate tabular-nums max-sm:hidden">
        {[`$${l.price.toLocaleString()}`, bedBathLabel(l.beds, l.baths), ppsf, dealBoardAcresLabel(l.lotAcres)]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className="shrink-0">
        <DealBoardStatusBadge status={l.status} />
      </span>
    </div>
  );
}

export default memo(LatestLineRow);
