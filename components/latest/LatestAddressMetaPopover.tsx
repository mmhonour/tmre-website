"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ClickableGoldilocksScore from "@/components/ClickableGoldilocksScore";
import {
  bedBathLabel,
  dealBoardAcresLabel,
  DealBoardStatusBadge,
  listingDetailHref,
} from "@/components/intelligence/deal-board/deal-board-shared";
import type { LatestListingRow } from "@/lib/latest-listings";

const POPOVER_WIDTH = 272;

type LatestAddressMetaPopoverProps = {
  listing: LatestListingRow;
  anchorEl: HTMLElement | null;
  onRequestClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function metaLines(l: LatestListingRow): string[] {
  const ppsf =
    !l.isRental && l.pricePerSqft != null
      ? `$${Math.round(l.pricePerSqft)}/sf`
      : null;
  return [
    `$${l.price.toLocaleString()}`,
    bedBathLabel(l.beds, l.baths),
    ppsf,
    dealBoardAcresLabel(l.lotAcres),
    l.sqft != null ? `${l.sqft.toLocaleString()} sqft` : null,
    l.yearBuilt != null ? `Built ${l.yearBuilt}` : null,
    l.dom != null ? `${l.dom}d DOM` : null,
    l.type || null,
  ].filter((line): line is string => Boolean(line));
}

export default function LatestAddressMetaPopover({
  listing,
  anchorEl,
  onRequestClose,
  onMouseEnter,
  onMouseLeave,
}: LatestAddressMetaPopoverProps) {
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    placeAbove: boolean;
  } | null>(null);

  useEffect(() => {
    if (!anchorEl) {
      setPos(null);
      return;
    }

    const sync = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popH = 148;
      const placeAbove = rect.bottom + popH + 12 > window.innerHeight && rect.top > popH + 12;
      const top = placeAbove ? rect.top - popH - 8 : rect.bottom + 8;
      const idealLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
      const left = Math.min(
        Math.max(8, idealLeft),
        window.innerWidth - POPOVER_WIDTH - 8,
      );
      setPos({ top, left, placeAbove });
    };

    sync();
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl || !onRequestClose) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorEl.contains(target)) return;
      const pop = document.getElementById(`latest-meta-popover-${listing.key}`);
      if (pop?.contains(target)) return;
      onRequestClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [anchorEl, listing.key, onRequestClose]);

  if (!pos || typeof document === "undefined") return null;

  const lines = metaLines(listing);
  const detailHref = listingDetailHref(listing);

  return createPortal(
    <div
      id={`latest-meta-popover-${listing.key}`}
      role="tooltip"
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 9998 }}
      className="fixed pointer-events-auto"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="rounded-xl border border-charcoal/10 bg-white shadow-xl shadow-black/15 overflow-hidden">
        <div className="px-3.5 py-3 space-y-2.5">
          <p className="font-medium text-navy text-[13px] leading-snug">{listing.address}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ClickableGoldilocksScore
              score={listing.score}
              breakdown={listing.scoreBreakdown}
              title={listing.address}
              subtitle={
                [listing.town || listing.city, listing.zip]
                  .filter(Boolean)
                  .join(" · ") || null
              }
              listingHref={detailHref}
              isRental={listing.isRental}
              className="text-[12px]"
            />
            <DealBoardStatusBadge status={listing.status} />
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-slate tabular-nums">
            {lines.join(" · ")}
          </p>
          {listing.headline ? (
            <p className="text-[11px] text-charcoal/60 italic leading-snug">{listing.headline}</p>
          ) : null}
        </div>
      </div>
      <span
        className="absolute left-1/2 -translate-x-1/2 border-4 border-transparent pointer-events-none"
        style={
          pos.placeAbove
            ? { bottom: -8, borderTopColor: "rgb(255 255 255)" }
            : { top: -8, borderBottomColor: "rgb(255 255 255)" }
        }
        aria-hidden
      />
    </div>,
    document.body,
  );
}
