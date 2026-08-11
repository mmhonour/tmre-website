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
import LatestMobileRow from "@/components/latest/LatestMobileRow";
import LatestZipMapHover from "@/components/latest/LatestZipMapHover";
import LatestTownMapHover from "@/components/latest/LatestTownMapHover";

function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type UpdatedAtParts = {
  time: string;
  /** When not today: weekday + month + day with ordinal suffix (suffix rendered in <sup>). */
  dateDay: number | null;
  datePrefix: string | null;
  dateSuffix: string | null;
  title: string;
};

function formatUpdatedAt(iso: string | null): UpdatedAtParts {
  const t = mlsTimestampMs(iso);
  if (Number.isNaN(t)) {
    return { time: "—", dateDay: null, datePrefix: null, dateSuffix: null, title: "MLS updated —" };
  }
  const date = new Date(t);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const today = new Date();
  if (isSameLocalDay(date, today)) {
    return {
      time,
      dateDay: null,
      datePrefix: null,
      dateSuffix: null,
      title: `MLS updated ${time} (your local time)`,
    };
  }
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  const day = date.getDate();
  const suffix = ordinalSuffix(day);
  const dateLabel = `${weekday} ${month} ${day}${suffix}`;
  return {
    time,
    dateDay: day,
    datePrefix: `${weekday} ${month} `,
    dateSuffix: suffix,
    title: `MLS updated ${dateLabel} ${time} (your local time)`,
  };
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
  const returnPath = useCurrentReturnPath();
  const detailHref = listingDetailHref(l, returnPath);
  // Prefer fresher of mod vs list date so New inventory doesn't show an older
  // ModificationTimestamp day when listDate is today/yesterday.
  const updatedAt = formatUpdatedAt(latestRowActivityIso(l));
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

  /** Invisible borders keep columns aligned like a table without showing grid lines. */
  const metaColClass =
    "box-border border border-transparent px-1.5 min-w-0 text-left";
  const addressColStyle = {
    width: `min(${addressColumnCh}ch, 46vw)`,
    minWidth: `min(${addressColumnCh}ch, 46vw)`,
    maxWidth: `min(${addressColumnCh}ch, 46vw)`,
  } as const;

  return (
    <>
      <div className="lg:hidden">
        <LatestMobileRow
          listing={l}
          isLive={isLive}
          isNew={isNew}
          hideTown={hideTown}
          showZipMap={showZipMap}
        />
      </div>
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className={`hidden lg:flex items-center gap-2 px-4 py-1.5 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors text-[13px] leading-snug ${
        isNew ? "bg-sage/[0.06] animate-[fadeIn_0.4s_ease-out]" : ""
      }`}
    >
      <div className="flex shrink-0 items-stretch gap-2">
        <div
          className="box-border flex w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] shrink-0 grow-0 flex-col justify-center overflow-hidden py-px"
          title={updatedAt.title}
        >
          <span className="font-mono text-[12px] tabular-nums leading-none text-navy whitespace-nowrap">
            {updatedAt.time}
          </span>
          {updatedAt.dateDay != null &&
          updatedAt.datePrefix != null &&
          updatedAt.dateSuffix != null ? (
            <span className="mt-0.5 font-mono text-[10px] leading-none text-slate whitespace-nowrap">
              {updatedAt.datePrefix}
              {updatedAt.dateDay}
              <sup className="text-[8px] leading-none">
                {updatedAt.dateSuffix}
              </sup>
            </span>
          ) : null}
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
          className="box-border w-[6.75rem] min-w-[6.75rem] max-w-[6.75rem] shrink-0 truncate font-mono text-[11px] tracking-[0.08em] uppercase text-gold font-semibold"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 items-center">
        <div
          className={`${metaColClass} flex shrink-0 flex-col gap-0.5 overflow-hidden`}
          style={addressColStyle}
        >
          <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
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
          <ClickableGoldilocksScore
            score={l.score}
            breakdown={l.scoreBreakdown}
            title={l.address}
            subtitle={[town, l.zip].filter(Boolean).join(" · ") || null}
            listingHref={detailHref}
            isRental={l.isRental}
            className="inline-flex w-fit justify-start text-[13px] leading-none"
          />
        </div>
        <div
          className={`${metaColClass} w-[7.5rem] shrink-0 font-mono text-[13px] tabular-nums text-navy`}
        >
          <div>{priceLabel}</div>
          {priceChangeLabel ? (
            <div
              className={`mt-0.5 text-[10px] leading-none ${priceChangeClass}`}
              title={
                l.priceChange
                  ? `Was $${l.priceChange.previousPrice.toLocaleString()}`
                  : undefined
              }
            >
              {priceChangeLabel}
            </div>
          ) : null}
        </div>
        <div
          className={`${metaColClass} min-w-0 flex-1 basis-0 truncate font-mono text-[13px] tabular-nums text-slate`}
          title={specsLabel || undefined}
        >
          {specsLabel || "—"}
        </div>
      </div>

      <span className="shrink-0">
        <DealBoardStatusBadge status={l.status} />
      </span>
    </div>
    </>
  );
}

export default memo(LatestLineRow);
