"use client";

import { useState } from "react";
import ListingAdminAgentPanel from "@/components/listing/ListingAdminAgentPanel";
import { SHOWCASE_SECTION_IDS } from "@/components/listing/showcase/showcase-sections";
import type { ListingVisionLink } from "@/lib/listing-vision-link-shared";

const VISION: ListingVisionLink = {
  town: "Westport",
  stamped: true,
  parcel: {
    visionPid: "3564",
    parcelHref: "/find/westport/3564",
    fieldCardHref: null,
    vgsiHref: "https://gis.vgsi.com/westportct/Parcel.aspx?pid=3564",
    addressFull: "16 Sea Spray Rd",
    mblu: null,
    useCode: null,
    ownerName: null,
    assessedValue: null,
    lastSalePrice: null,
    lastSaleDate: null,
    linkedMlsId: null,
  },
  candidates: [],
  danglingPid: null,
};

export function ListingAdminMobilePreview() {
  const [lit, setLit] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        aria-pressed={lit}
        onClick={() => {
          setLit(true);
          document
            .getElementById(SHOWCASE_SECTION_IDS.admin)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
          lit
            ? "border-gold/50 bg-gold/10 text-navy"
            : "border-charcoal/[0.08] bg-white text-navy"
        }`}
      >
        Admin
      </button>

      <div className="rounded-2xl border border-charcoal/[0.08] bg-navy/90 px-5 py-16 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
        Map (page bottom)
      </div>

      <section
        id={SHOWCASE_SECTION_IDS.admin}
        className="scroll-mt-24 border-t border-charcoal/[0.08] pt-5"
      >
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
          Admin
        </p>
        <ListingAdminAgentPanel
          contact={{
            contactingLabel: "Showing contact",
            contactingName: "Jane Broker",
            phone: "203-555-0100",
            email: "jane@example.com",
            agentMlsId: "G123",
            listAgentName: "Jane Broker",
            listOfficeName: "The Mather Group",
            coListAgentName: null,
            showingContactType: null,
          }}
          vision={VISION}
          mlsId="24123456"
          anchorId={null}
        />
      </section>
    </div>
  );
}
