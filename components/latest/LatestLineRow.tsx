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
  /**
   * Fixed address column width in `ch` (from max address length in the feed)
   * so price columns left-align across rows.
   */
  addressColumnCh?: number;
};

function LatestLineRow({
  listing: l,
  isLive,
  isNew = false,
  hideTown = false,
  showZipMap = false,
  addressColumnCh = 24,
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

  const bedBath = bedBathLabel(l.beds, l.baths);
  const acres = dealBoardAcresLabel(l.lotAcres);
  const specsLabel = [bedBath, ppsf, acres].filter(Boolean).join(" · ");
  const priceLabel = `$${l.price.toLocaleString()}`;

  /** Invisible borders keep columns aligned like a table without showing grid lines. */
  const metaColClass =
    "box-border border border-transparent px-1.5 min-w-0 text-left";
  const addressColStyle = {
    width: `min(${addressColumnCh}ch, 46vw)`,
    minWidth: `min(${addressColumnCh}ch, 46vw)`,
    maxWidth: `min(${addressColumnCh}ch, 46vw)`,
  } as const;

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className={`flex items-start sm:items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 sm:px-4 py-1.5 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors text-[13px] leading-snug ${
        isNew ? "bg-sage/[0.06] animate-[fadeIn_0.4s_ease-out]" : ""
      }`}
    >
      <div className="flex shrink-0 items-stretch gap-1.5 sm:gap-2">
        <div
          className="box-border flex w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem] sm:w-[3.75rem] sm:min-w-[3.75rem] sm:max-w-[3.75rem] shrink-0 grow-0 flex-col justify-between overflow-hidden py-px"
          title={`MLS updated ${updatedLabel} (your local time)`}
        >
          <span className="font-mono text-[11px] sm:text-[12px] tabular-nums leading-none text-navy whitespace-nowrap">
            {updatedLabel}
          </span>
          <ClickableGoldilocksScore
            score={l.score}
            breakdown={l.scoreBreakdown}
            title={l.address}
            subtitle={[town, l.zip].filter(Boolean).join(" · ") || null}
            listingHref={detailHref}
            isRental={l.isRental}
            className="shrink-0 self-start text-[13px] leading-none"
          />
        </div>
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
      </div>
      {town ? (
        <LatestTownMapHover
          townName={town}
          className="shrink-0 font-mono text-[11px] tracking-[0.08em] uppercase text-gold font-semibold mt-0.5 sm:mt-0"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 items-start sm:items-center">
        <div
          className={`${metaColClass} flex shrink-0 items-baseline gap-x-1.5 overflow-hidden`}
          style={addressColStyle}
        >
          <LatestAddressMetaHover
            listing={l}
            href={detailHref}
            isLive={isLive}
            className="min-w-0 flex-1 truncate font-medium text-navy hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold whitespace-nowrap"
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
        </div>
        <div
          className={`${metaColClass} w-[7.5rem] shrink-0 font-mono text-[12px] sm:text-[13px] tabular-nums text-navy`}
        >
          {priceLabel}
        </div>
        <div
          className={`${metaColClass} min-w-0 flex-1 basis-0 truncate font-mono text-[12px] sm:text-[13px] tabular-nums text-slate`}
          title={specsLabel || undefined}
        >
          {specsLabel || "—"}
        </div>
      </div>

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
