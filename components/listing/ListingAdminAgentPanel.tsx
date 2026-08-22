"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ListingDeckCardHeader from "@/components/listing/ListingDeckCardHeader";
import { useListingDesktopDeck } from "@/components/listing/ListingDesktopDeckContext";
import type { ListingAgentContact } from "@/lib/listing-agent-contact";
import type {
  ListingVisionLink,
  ListingVisionParcel,
} from "@/lib/listing-vision-link-shared";

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
}) {
  if (children == null && !value?.trim()) return null;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/45">
        {label}
      </dt>
      <dd className="min-w-0 text-sm text-navy break-words">
        {children ?? value}
      </dd>
    </div>
  );
}

function usd(n: number | null): string | null {
  return n == null ? null : `$${n.toLocaleString()}`;
}

/** PID as the link to our Field Card page, with the VGSI PDF beside it. */
function ParcelLinks({ parcel }: { parcel: ListingVisionParcel }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {parcel.parcelHref ? (
        <Link
          href={parcel.parcelHref}
          className="font-mono text-sm text-navy underline decoration-gold/50 underline-offset-2 hover:text-gold"
        >
          PID {parcel.visionPid}
        </Link>
      ) : (
        <span className="font-mono text-sm">PID {parcel.visionPid}</span>
      )}
      {parcel.fieldCardHref ? (
        <a
          href={parcel.fieldCardHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/45 hover:text-gold"
        >
          Field card
        </a>
      ) : null}
      <a
        href={parcel.vgsiHref}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/45 hover:text-gold"
      >
        VGSI
      </a>
    </span>
  );
}

function VisionBlock({
  vision,
  mlsId,
}: {
  vision: ListingVisionLink;
  mlsId: string;
}) {
  const parcel = vision.parcel;
  const mismatchedMlsId =
    parcel?.linkedMlsId && parcel.linkedMlsId !== mlsId.trim()
      ? parcel.linkedMlsId
      : null;
  const lastSale = parcel
    ? [usd(parcel.lastSalePrice), parcel.lastSaleDate].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="mt-3 border-t border-gold/25 pt-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-gold">
        {vision.town} assessor
      </p>
      {parcel ? (
        <dl className="space-y-2.5">
          <Row label="Parcel">
            <ParcelLinks parcel={parcel} />
          </Row>
          <Row label="Vision address" value={parcel.addressFull} />
          <Row label="Owner" value={parcel.ownerName} />
          <Row label="MBLU" value={parcel.mblu} />
          <Row label="Use code" value={parcel.useCode} />
          <Row label="Assessed" value={usd(parcel.assessedValue)} />
          <Row label="Last sale" value={lastSale} />
          {mismatchedMlsId ? (
            <Row label="Link warning">
              <span className="text-sm text-coral">
                Parcel row points at #{mismatchedMlsId}, not this listing.
              </span>
            </Row>
          ) : null}
        </dl>
      ) : vision.danglingPid ? (
        <p className="text-sm text-slate leading-snug">
          <span className="font-mono">listings.vision_pid</span> is{" "}
          <span className="font-mono">{vision.danglingPid}</span>, but no{" "}
          {vision.town} parcel row answers to it — the crawl may have renumbered
          it.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate leading-snug">
            No parcel is paired with this listing. The Vision match stack only
            stamps a PID when exactly one parcel matches the address.
          </p>
          {vision.candidates.length ? (
            <dl className="space-y-2.5">
              <Row
                label={
                  vision.candidates.length === 1 ? "Likely parcel" : "Candidates"
                }
              >
                <span className="flex flex-col gap-1.5">
                  {vision.candidates.map((candidate) => (
                    <span key={candidate.visionPid} className="flex flex-col">
                      <ParcelLinks parcel={candidate} />
                      {candidate.addressFull ? (
                        <span className="text-[13px] text-slate">
                          {candidate.addressFull}
                          {candidate.ownerName ? ` · ${candidate.ownerName}` : ""}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </Row>
            </dl>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function ListingAdminAgentPanel({
  contact,
  vision = null,
  mlsId = "",
  frameClassName = "",
  /** When true, join the desktop card deck (header toggle + minimize). */
  deckMode = false,
}: {
  contact: ListingAgentContact | null;
  /** VGSI parcel pairing from the listing / spotlight payload. */
  vision?: ListingVisionLink | null;
  /** Listing MLS number — used to flag a parcel row linked to a different one. */
  mlsId?: string;
  frameClassName?: string;
  deckMode?: boolean;
}) {
  const deck = useListingDesktopDeck();
  const inDeck = deckMode && deck != null;
  const expanded = inDeck ? deck.isExpanded("admin") : true;

  const contactBody = !contact ? (
    <p className="text-sm text-slate leading-snug">
      No list-agent / showing-contact fields on this listing&rsquo;s MLS row
      (IDX feeds often omit phone and email).
    </p>
  ) : (
    <dl className="space-y-2.5">
      <Row label={contact.contactingLabel} value={contact.contactingName} />
      <Row label="Phone" value={contact.phone} />
      <Row label="Email" value={contact.email} />
      <Row label="Agent MLS #" value={contact.agentMlsId} />
      {contact.listAgentName &&
      contact.listAgentName !== contact.contactingName ? (
        <Row label="List agent" value={contact.listAgentName} />
      ) : null}
      <Row label="List office" value={contact.listOfficeName} />
      <Row label="Co-list agent" value={contact.coListAgentName} />
    </dl>
  );

  const body = (
    <>
      {contactBody}
      {vision ? <VisionBlock vision={vision} mlsId={mlsId} /> : null}
    </>
  );

  if (inDeck) {
    return (
      <section
        id="listing-admin"
        className={`scroll-mt-[var(--listing-sticky-offset,6rem)] rounded-sm border border-gold/35 bg-cream/95 p-4 shadow-sm ${frameClassName}`}
        aria-label="Admin — listing agent contact"
      >
        <ListingDeckCardHeader
          cardId="admin"
          title="Admin · Contacting agent"
          titleClassName="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
        />
        <div
          id="listing-deck-body-admin"
          className="overflow-hidden transition-[max-height] duration-300 ease-out"
          style={{ maxHeight: expanded ? (vision ? 2400 : 1200) : 0 }}
          aria-hidden={!expanded}
        >
          <div className={expanded ? "mt-3" : "invisible h-0"}>{body}</div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="listing-admin"
      className={`scroll-mt-[var(--listing-sticky-offset,6rem)] rounded-sm border border-gold/35 bg-cream/95 p-4 shadow-sm ${frameClassName}`}
      aria-label="Admin — listing agent contact"
    >
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-gold">
        Admin · Contacting agent
      </p>
      {body}
    </section>
  );
}
