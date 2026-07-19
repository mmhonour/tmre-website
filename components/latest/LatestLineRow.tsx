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
import ClickableGoldilocksScore from "@/components/ClickableGoldilocksScore";
import LatestAddressMetaHover from "@/components/latest/LatestAddressMetaHover";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";

function formatUpdatedAt(iso: string | null): string {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

/** Millions only, nearest $100k — $500K → $.5M, $1.45M → $1.5M */
function formatPriceMillions(price: number): string {
  const tenths = Math.round(price / 100_000);
  const millions = tenths / 10;
  if (millions <= 0) return "$0M";
  if (millions < 1) {
    return `$${String(millions).replace(/^0/, "")}M`;
  }
  const label =
    Number.isInteger(millions) ? String(millions) : millions.toFixed(1);
  return `$${label}M`;
}

const STATUS_DOT_CLASS: Record<string, string> = {
  New: "bg-sage",
  Active: "bg-sky",
  Reduced: "bg-coral",
  Pending: "bg-slate",
};

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
  const ppsf =
    !l.isRental && l.pricePerSqft != null
      ? `$${Math.round(l.pricePerSqft)}/sf`
      : null;
  const statusDotClass = STATUS_DOT_CLASS[l.status] ?? "bg-slate";

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className={`flex items-start sm:items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 sm:px-4 py-1.5 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors text-[13px] leading-snug ${
        isNew ? "bg-sage/[0.06] animate-[fadeIn_0.4s_ease-out]" : ""
      }`}
    >
      <span
        className="box-border flex items-center justify-start w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem] sm:w-[3.75rem] sm:min-w-[3.75rem] sm:max-w-[3.75rem] shrink-0 grow-0 overflow-hidden leading-tight pt-0.5 sm:pt-0"
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
        className="rounded-md shrink-0 mt-0.5 sm:mt-0"
        showPhotoCountBadge={false}
      />
      <ClickableGoldilocksScore
        score={l.score}
        breakdown={l.scoreBreakdown}
        title={l.address}
        subtitle={[town, l.zip].filter(Boolean).join(" · ") || null}
        listingHref={detailHref}
        isRental={l.isRental}
        className="shrink-0 text-[13px] mt-0.5 sm:mt-0"
      />
      {town ? (
        <LatestTownMapHover
          townName={town}
          className="shrink-0 font-mono text-[11px] tracking-[0.08em] uppercase text-gold font-semibold mt-0.5 sm:mt-0"
        />
      ) : null}
      <span className="text-charcoal/25 shrink-0 mt-0.5 sm:mt-0" aria-hidden>
        ·
      </span>

      {/* Address: wrap on narrow; price in $M sits left of address on mobile */}
      <span className="flex min-w-0 flex-1 sm:flex-none sm:max-w-[42%] items-start gap-1.5">
        <span className="font-mono text-[11px] tabular-nums text-gold shrink-0 mt-0.5 sm:hidden">
          {formatPriceMillions(l.price)}
        </span>
        <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <LatestAddressMetaHover
            listing={l}
            href={detailHref}
            isLive={isLive}
            className="min-w-0 font-medium text-navy hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold whitespace-normal break-words [overflow-wrap:anywhere] sm:truncate sm:whitespace-nowrap sm:break-normal"
          >
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
      </span>

      <span className="text-charcoal/25 shrink-0 hidden sm:inline" aria-hidden>
        ·
      </span>
      <span className="min-w-0 flex-1 truncate text-center font-mono text-slate tabular-nums hidden sm:inline">
        {[
          `$${l.price.toLocaleString()}`,
          bedBathLabel(l.beds, l.baths),
          ppsf,
          dealBoardAcresLabel(l.lotAcres),
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>

      {/* Narrow: colored status dot (group-header pills are the legend). Wider: full badge. */}
      <span
        className={`sm:hidden shrink-0 mt-1.5 h-2.5 w-2.5 rounded-full ring-1 ring-black/10 ${statusDotClass}`}
        title={l.status}
        aria-label={l.status}
      />
      <span className="hidden sm:inline shrink-0">
        <DealBoardStatusBadge status={l.status} />
      </span>
    </div>
  );
}

export default memo(LatestLineRow);
