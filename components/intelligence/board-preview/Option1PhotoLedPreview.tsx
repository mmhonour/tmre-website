"use client";

import {
  bedBathLabel,
  BoardPreviewShell,
  formatPrice,
  PreviewBoardFrame,
  PreviewPrimaryPhoto,
  PreviewScoreBadge,
  PreviewStatusBadge,
} from "@/components/intelligence/board-preview/shared";
import { useBoardPreviewListings } from "@/components/intelligence/board-preview/useBoardPreviewListings";
import type { BoardPreviewListing } from "@/components/intelligence/board-preview/types";

function PhotoLedRow({
  listing,
  rank,
  priority,
}: {
  listing: BoardPreviewListing;
  rank: number;
  priority?: boolean;
}) {
  const ppsf =
    listing.pricePerSqft != null ? `$${Math.round(listing.pricePerSqft)}/sf` : null;

  return (
    <div className="flex gap-4 px-4 py-2.5 border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/[0.04] transition-colors">
      <span
        className="font-mono text-xs tabular-nums text-slate w-6 shrink-0 pt-1 text-right"
        aria-hidden
      >
        {rank}
      </span>
      <PreviewPrimaryPhoto
        listing={listing}
        width={128}
        height={84}
        priority={priority}
      />
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PreviewScoreBadge
            score={listing.score}
            title={listing.address}
            listingHref={`/listings/${encodeURIComponent(listing.key)}`}
          />
          <PreviewStatusBadge status={listing.status} />
        </div>
        <p className="font-medium text-navy text-sm leading-snug truncate">
          {listing.address}
        </p>
        <p className="font-mono text-[11px] text-slate tabular-nums">
          {bedBathLabel(listing.beds, listing.baths)}
          {" · "}
          <span className="text-navy">{formatPrice(listing.price)}</span>
          {ppsf ? ` · ${ppsf}` : null}
          {listing.dom != null ? ` · ${listing.dom}d DOM` : null}
        </p>
        <p className="text-xs text-slate/80 truncate">{listing.type}</p>
      </div>
    </div>
  );
}

export default function Option1PhotoLedPreview() {
  const { listings, loading, source } = useBoardPreviewListings();

  return (
    <BoardPreviewShell
      title="Photo-led rows"
      description="One larger primary photo per row with score, status, address, and key stats stacked beside it. No separate photo column or 2×2 thumb grid — photo count badge links to the gallery."
    >
      <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate mb-4">
        {loading
          ? "Loading listings…"
          : `${listings.length} sample listings · ${source === "live" ? "live MLS photos" : "mock data"}`}
      </p>

      <PreviewBoardFrame label="Proposed layout">
        <div className="divide-y divide-charcoal/[0.06]">
          {loading ? (
            <p className="px-4 py-12 text-center text-slate text-sm">Loading…</p>
          ) : (
            listings.map((l, i) => (
              <PhotoLedRow
                key={l.key}
                listing={l}
                rank={i + 1}
                priority={i < 3}
              />
            ))
          )}
        </div>
      </PreviewBoardFrame>

      <ul className="mt-6 space-y-2 text-sm text-slate max-w-xl">
        <li>
          <strong className="text-navy font-medium">Photo:</strong> 128×84px
          primary (~46% larger area than today)
        </li>
        <li>
          <strong className="text-navy font-medium">Row height:</strong> ~84px
          + padding — similar to current despite bigger photo
        </li>
        <li>
          <strong className="text-navy font-medium">Columns removed:</strong>{" "}
          separate Photos, Bed, Bath, $/sf, Sqft, DOM, Town
        </li>
      </ul>
    </BoardPreviewShell>
  );
}
