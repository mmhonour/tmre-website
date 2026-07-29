"use client";

import ListingDeckCardHeader from "@/components/listing/ListingDeckCardHeader";
import { useListingDesktopDeck } from "@/components/listing/ListingDesktopDeckContext";
import type { ListingAgentContact } from "@/lib/listing-agent-contact";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/45">
        {label}
      </dt>
      <dd className="min-w-0 text-sm text-navy break-words">{value}</dd>
    </div>
  );
}

export default function ListingAdminAgentPanel({
  contact,
  frameClassName = "",
  /** When true, join the desktop card deck (header toggle + minimize). */
  deckMode = false,
}: {
  contact: ListingAgentContact | null;
  frameClassName?: string;
  deckMode?: boolean;
}) {
  const deck = useListingDesktopDeck();
  const inDeck = deckMode && deck != null;
  const expanded = inDeck ? deck.isExpanded("admin") : true;

  const body = !contact ? (
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
          style={{ maxHeight: expanded ? 1200 : 0 }}
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
