"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ClickableGoldilocksScore from "@/components/ClickableGoldilocksScore";
import ListingThumbImage from "@/components/ListingThumbImage";
import type { BoardPreviewListing, BoardPreviewStatus } from "@/components/intelligence/board-preview/types";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

export function boardPhotoUrl(listing: BoardPreviewListing): string | null {
  if (!/^\d/.test(listing.key)) return null;
  return listingPhotoProxyUrl(listing.key, 0);
}

export function formatPrice(n: number): string {
  return `$${n.toLocaleString()}`;
}

export function bedBathLabel(beds: number | null, baths: number | null): string {
  const b = beds != null ? `${beds}bd` : "—bd";
  const ba = baths != null ? `${baths}ba` : "—ba";
  return `${b} · ${ba}`;
}

export function PreviewScoreBadge({
  score,
  title = "Listing",
  listingHref = null,
}: {
  score: number;
  title?: string;
  listingHref?: string | null;
}) {
  return (
    <ClickableGoldilocksScore
      score={score}
      title={title}
      listingHref={listingHref}
      className="text-base"
    />
  );
}

export function PreviewStatusBadge({ status }: { status: BoardPreviewStatus }) {
  const map: Record<BoardPreviewStatus, string> = {
    New: "bg-sage/10 text-sage border-sage/30",
    Active: "bg-sky/10 text-sky border-sky/30",
    Reduced: "bg-coral/10 text-coral border-coral/30",
    Pending: "bg-charcoal/10 text-slate border-charcoal/20",
  };
  const label = status === "Reduced" ? "Reduced!" : status;
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2.5 py-1 ${map[status]}`}
    >
      {label}
    </span>
  );
}

export function PreviewPrimaryPhoto({
  listing,
  width,
  height,
  priority = false,
  className = "rounded-lg",
}: {
  listing: BoardPreviewListing;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
}) {
  const src = boardPhotoUrl(listing);
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-charcoal/10 shadow-md ${className}`}
      style={{ width, height }}
    >
      {src ? (
        <ListingThumbImage
          src={src}
          priority={priority}
          className="absolute inset-0 block h-full w-full"
          imgClassName="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-charcoal/15 via-cream to-gold/20" />
      )}
      {listing.photoCount != null && listing.photoCount > 1 ? (
        <span className="absolute bottom-1.5 right-1.5 font-mono text-[8px] tracking-wide text-white bg-black/60 rounded px-1 py-px">
          +{listing.photoCount - 1}
        </span>
      ) : null}
    </div>
  );
}

/** Current production photo stack (88×52 primary + 2×2 thumbs). */
export function CurrentPhotoStack({
  listing,
  priority = false,
}: {
  listing: BoardPreviewListing;
  priority?: boolean;
}) {
  const primaryW = 88;
  const primaryH = 52;
  const cellW = 44;
  const cellH = 26;
  const gap = 1;
  const src = boardPhotoUrl(listing);

  return (
    <div className="flex shrink-0 items-center" style={{ gap: 10 }}>
      <div
        className="relative shrink-0 overflow-hidden rounded-lg shadow-md bg-charcoal/10"
        style={{ width: primaryW, height: primaryH }}
      >
        {src ? (
          <ListingThumbImage
            src={src}
            priority={priority}
            className="absolute inset-0 block h-full w-full"
            imgClassName="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-charcoal/15 to-cream" />
        )}
      </div>
      <div className="flex flex-col" style={{ gap }}>
        {[0, 1].map((row) => (
          <div key={row} className="flex" style={{ gap }}>
            {[1, 2, 3, 4].slice(row * 2, row * 2 + 2).map((idx) => (
              <div
                key={idx}
                className="relative shrink-0 overflow-hidden rounded-sm bg-charcoal/10"
                style={{ width: cellW, height: cellH }}
              >
                {src ? (
                  <ListingThumbImage
                    src={listingPhotoProxyUrl(listing.key, idx)}
                    className="absolute inset-0 block h-full w-full"
                    imgClassName="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardPreviewShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="border-b border-charcoal/10 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <Link
            href="/intelligence"
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate hover:text-gold transition-colors"
          >
            ← Back to deal board
          </Link>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-4 mb-1">
            Layout preview
          </p>
          <h1 className="font-serif text-2xl sm:text-3xl text-navy">{title}</h1>
          <p className="text-slate text-sm mt-1 max-w-2xl">{description}</p>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</div>
    </div>
  );
}

export function PreviewBoardFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}
