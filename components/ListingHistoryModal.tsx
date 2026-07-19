"use client";

import Link from "next/link";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import ModalPortal, { MODAL_PANEL_WIDE_CLASS } from "@/components/ModalPortal";
import { listingDetailHref, listingHistoryHref } from "@/lib/listing-url";

export default function ListingHistoryModal({
  open,
  onClose,
  mlsId,
  title,
  subtitle = null,
  townHint = null,
  listingHref = null,
}: {
  open: boolean;
  onClose: () => void;
  mlsId: string;
  title: string;
  subtitle?: string | null;
  townHint?: string | null;
  listingHref?: string | null;
}) {
  const historyHref = listingHistoryHref(mlsId, title, townHint);

  return (
    <ModalPortal open={open} onClose={onClose} ariaLabel="Listing history">
      <div
        className={MODAL_PANEL_WIDE_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
              Listing history
              {subtitle ? ` · ${subtitle}` : ""}
            </p>
            <h2 className="font-serif text-2xl text-navy">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate hover:text-navy transition-colors font-mono text-lg leading-none mt-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <ListingHistoryPanel
          mlsId={mlsId}
          townHint={townHint}
          variant="modal"
        />

        <div className="flex items-center justify-between gap-4 pt-6 mt-6 border-t border-charcoal/[0.06]">
          {listingHref ? (
            <Link
              href={listingHref}
              className="font-mono text-[10px] tracking-[0.15em] uppercase text-navy hover:text-gold transition-colors"
            >
              View listing →
            </Link>
          ) : null}
          <Link
            href={historyHref}
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline ml-auto"
          >
            Full history page →
          </Link>
        </div>
      </div>
    </ModalPortal>
  );
}
