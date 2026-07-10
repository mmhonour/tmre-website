"use client";

import Link from "next/link";
import {
  bedBathLabel,
  boardRankColor,
  dealBoardAcresLabel,
  dealBoardDomWithType,
  dealBoardSqftLabel,
  dealBoardYearBuiltLabel,
  DealBoardPrimaryPhoto,
  DealBoardScoreBadge,
  DealBoardStatusBadge,
  DealBoardAddressWithInsight,
  DealBoardAdaptiveMetaLine,
  listingDetailHref,
  listingTown,
} from "@/components/intelligence/deal-board/deal-board-shared";
import type { DealBoardRowProps } from "@/components/intelligence/deal-board/deal-board-types";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";

function dealBoardPriceMeta(l: DealBoardRowProps["listing"]) {
  const ppsf =
    !l.isRental && l.pricePerSqft != null
      ? `$${Math.round(l.pricePerSqft)}/sf`
      : null;
  const domType = dealBoardDomWithType(l.dom, l.type);
  return { ppsf, domType };
}

export function DealBoardPhotoLedRow({
  listing: l,
  scoreRank,
  rankTotal,
  isLive,
  onScoreClick,
  onStatusClick,
}: DealBoardRowProps) {
  const rankColor = boardRankColor(scoreRank, rankTotal);
  const { ppsf, domType } = dealBoardPriceMeta(l);

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className="flex gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors"
    >
      <span
        className="font-mono text-xs tabular-nums w-6 shrink-0 pt-1 text-right font-semibold"
        style={{ color: rankColor }}
      >
        {scoreRank + 1}
      </span>
      <DealBoardPrimaryPhoto
        listing={l}
        isLive={isLive}
        width={128}
        height={84}
        priority={scoreRank < 8}
      />
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DealBoardScoreBadge
            value={l.score}
            onClick={() => onScoreClick(l)}
          />
          <DealBoardStatusBadge
            status={l.status}
            onClick={
              isLive && onStatusClick ? () => onStatusClick(l) : undefined
            }
          />
        </div>
        <DealBoardAddressWithInsight listing={l} isLive={isLive} />
        <p className="font-mono text-[11px] text-slate tabular-nums truncate">
          {bedBathLabel(l.beds, l.baths)}
          {" · "}
          <span className="text-navy">${l.price.toLocaleString()}</span>
          {ppsf ? ` · ${ppsf}` : null}
          {domType ? ` · ${domType}` : null}
        </p>
      </div>
    </div>
  );
}

export function DealBoardPhotoLedLineRow({
  listing: l,
  scoreRank,
  rankTotal,
  isLive,
  showTown,
  onScoreClick,
  onStatusClick,
}: DealBoardRowProps) {
  const rankColor = boardRankColor(scoreRank, rankTotal);
  const { ppsf } = dealBoardPriceMeta(l);
  const town = showTown ? listingTown(l) : null;
  const detailHref = listingDetailHref(l);
  const addressClassName =
    "font-medium text-navy hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold";

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className="flex items-start gap-2 px-3 sm:px-4 py-1 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors"
    >
      <span
        className="font-mono text-[10px] tabular-nums w-5 shrink-0 text-right font-semibold"
        style={{ color: rankColor }}
      >
        {scoreRank + 1}
      </span>
      <DealBoardPrimaryPhoto
        listing={l}
        isLive={isLive}
        width={48}
        height={32}
        priority={scoreRank < 8}
        className="rounded-md"
      />
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug">
        {(() => {
          const scoreColor =
            l.score >= 85
              ? "text-sage"
              : l.score >= 70
                ? "text-gold"
                : "text-charcoal/50";
          return (
            <button
              type="button"
              onClick={() => onScoreClick(l)}
              className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${scoreColor} underline underline-offset-2 decoration-charcoal/20 hover:decoration-gold transition-colors`}
              aria-label={`Score ${l.score.toFixed(1)} — view breakdown`}
            >
              {l.score.toFixed(1)}
            </button>
          );
        })()}
        {isLive && onStatusClick ? (
          <button
            type="button"
            onClick={() => onStatusClick(l)}
            className="shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase text-slate hover:text-gold transition-colors"
          >
            {l.status === "Reduced" ? "Reduced!" : l.status}
          </button>
        ) : (
          <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
            {l.status === "Reduced" ? "Reduced!" : l.status}
          </span>
        )}
        <span className="text-charcoal/25 shrink-0" aria-hidden>
          ·
        </span>
        {isLive ? (
          <Link href={detailHref} className={`min-w-0 break-words ${addressClassName}`}>
            {l.address}
          </Link>
        ) : (
          <span className="min-w-0 break-words font-medium text-navy">
            {l.address}
          </span>
        )}
        <span className="text-charcoal/25 shrink-0" aria-hidden>
          ·
        </span>
        <DealBoardAdaptiveMetaLine
          as="span"
          parts={[
            `$${l.price.toLocaleString()}`,
            dealBoardSqftLabel(l.sqft),
            ppsf,
            l.beds != null ? `${l.beds}bd` : "—bd",
            l.baths != null ? `${l.baths}ba` : "—ba",
            l.dom != null ? `${l.dom}d DOM` : null,
            l.type || null,
            town,
          ]}
          sqft={null}
          yearBuilt={l.yearBuilt}
          lotAcres={l.lotAcres}
          className="min-w-0 font-mono text-slate tabular-nums"
        />
        {l.headline ? (
          <span className="min-w-0 basis-full text-[10px] text-charcoal/60 italic sm:basis-auto sm:max-w-[38%] sm:ml-auto sm:text-right">
            {l.headline}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DealBoardPhotoLedGridCard({
  listing: l,
  scoreRank,
  rankTotal,
  isLive,
  showTown,
  onScoreClick,
  onStatusClick,
}: DealBoardRowProps) {
  const rankColor = boardRankColor(scoreRank, rankTotal);
  const { ppsf } = dealBoardPriceMeta(l);
  const town = showTown ? listingTown(l) : null;

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-charcoal/[0.08] bg-white transition-colors hover:border-gold/25 hover:bg-gold/[0.03]"
    >
      <div className="relative">
        <span
          className="absolute left-2 top-2 z-10 rounded-md bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums shadow-sm backdrop-blur-sm"
          style={{ color: rankColor }}
        >
          {scoreRank + 1}
        </span>
        <div className="absolute right-2 top-2 z-10 flex max-w-[62%] min-w-0 flex-col items-end gap-1.5">
          <div className="w-full min-w-0 rounded-md bg-white px-2 py-1 shadow-sm">
            {isLive ? (
              <Link
                href={listingDetailHref(l)}
                className="block text-right font-medium text-navy text-[10px] leading-snug hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold truncate"
                title={l.address}
              >
                {l.address}
              </Link>
            ) : (
              <span
                className="block text-right font-medium text-navy text-[10px] leading-snug truncate"
                title={l.address}
              >
                {l.address}
              </span>
            )}
          </div>
          <DealBoardScoreBadge
            value={l.score}
            variant="pill"
            opaque
            onClick={() => onScoreClick(l)}
          />
        </div>
        <DealBoardPrimaryPhoto
          listing={l}
          isLive={isLive}
          width={3}
          height={2}
          fluid
          className="rounded-none"
          priority={scoreRank < 4}
          overlay={
            <div
              className="absolute bottom-1.5 left-1.5 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <DealBoardStatusBadge
                status={l.status}
                size="sm"
                surface="photo"
                onClick={
                  isLive && onStatusClick ? () => onStatusClick(l) : undefined
                }
              />
            </div>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <p className="font-mono text-[10px] text-slate tabular-nums">
          {bedBathLabel(l.beds, l.baths)}
          {" · "}
          <span className="text-navy">${l.price.toLocaleString()}</span>
        </p>
        <DealBoardAdaptiveMetaLine
          parts={[
            dealBoardSqftLabel(l.sqft),
            ppsf,
            dealBoardAcresLabel(l.lotAcres),
            l.dom != null ? `${l.dom}d DOM` : null,
            l.type || null,
            dealBoardYearBuiltLabel(l.yearBuilt),
            town,
          ]}
          sqft={null}
          yearBuilt={null}
          lotAcres={null}
          className="font-mono text-[10px] text-slate/80 tabular-nums truncate"
        />
        {l.headline ? (
          <p className="text-xs text-charcoal/60 italic leading-snug line-clamp-2 pt-0.5">
            {l.headline}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DealBoardPhotoLedLargeCard({
  listing: l,
  scoreRank,
  rankTotal,
  isLive,
  showTown,
  onScoreClick,
  onStatusClick,
}: DealBoardRowProps) {
  const rankColor = boardRankColor(scoreRank, rankTotal);
  const { ppsf, domType } = dealBoardPriceMeta(l);
  const town = showTown ? listingTown(l) : null;

  return (
    <div
      {...listingHoverHandlers(isLive ? l.key : null)}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-charcoal/[0.08] bg-white transition-colors hover:border-gold/25 hover:bg-gold/[0.03]"
    >
      <div className="relative">
        <span
          className="absolute left-2 top-2 z-10 rounded-md bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums shadow-sm backdrop-blur-sm"
          style={{ color: rankColor }}
        >
          {scoreRank + 1}
        </span>
        <div className="absolute right-2 top-2 z-10 max-w-[62%] rounded-md bg-white px-2 py-1 shadow-sm">
          {isLive ? (
            <Link
              href={listingDetailHref(l)}
              className="block text-right font-medium text-navy text-xs leading-snug hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold line-clamp-2"
            >
              {l.address}
            </Link>
          ) : (
            <span className="block text-right font-medium text-navy text-xs leading-snug line-clamp-2">
              {l.address}
            </span>
          )}
        </div>
        <DealBoardPrimaryPhoto
          listing={l}
          isLive={isLive}
          width={16}
          height={10}
          fluid
          className="rounded-none"
          priority={scoreRank < 4}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <DealBoardStatusBadge
            status={l.status}
            onClick={
              isLive && onStatusClick ? () => onStatusClick(l) : undefined
            }
          />
          <DealBoardScoreBadge
            value={l.score}
            variant="pill"
            onClick={() => onScoreClick(l)}
          />
        </div>
        <p className="font-mono text-[10px] text-slate tabular-nums">
          {bedBathLabel(l.beds, l.baths)}
          {" · "}
          <span className="text-navy">${l.price.toLocaleString()}</span>
        </p>
        <DealBoardAdaptiveMetaLine
          parts={[ppsf, domType, town]}
          sqft={l.sqft}
          yearBuilt={l.yearBuilt}
          lotAcres={l.lotAcres}
          className="font-mono text-[10px] text-slate/80 tabular-nums truncate"
        />
        <DealBoardAddressWithInsight
          listing={l}
          isLive={isLive}
          showAddress={false}
        />
      </div>
    </div>
  );
}
