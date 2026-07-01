"use client";

import { useState } from "react";
import ContactFormPanel from "@/components/ContactFormPanel";
import ModalPortal from "@/components/ModalPortal";

function formatListingInfo(
  mlsId: string,
  address: string,
  city?: string | null,
): string {
  const place = [address, city].filter(Boolean).join(", ");
  return place ? `MLS# ${mlsId} · ${place}` : `MLS# ${mlsId}`;
}

export default function ListingInterestButton({
  mlsId,
  address,
  city,
  variant = "default",
}: {
  mlsId: string;
  address: string;
  city?: string | null;
  variant?: "default" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const listingInfo = formatListingInfo(mlsId, address, city);
  const inline = variant === "inline";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          inline
            ? "inline-flex shrink-0 items-center justify-center rounded-full bg-gold px-4 py-2 font-mono text-[10px] tracking-wide text-navy transition-all hover:bg-gold-light hover:shadow-md hover:shadow-gold/25"
            : "w-full inline-flex items-center justify-center rounded-full bg-gold px-5 py-3 text-sm font-medium text-navy transition-all hover:bg-gold-light hover:shadow-lg hover:shadow-gold/25"
        }
      >
        I&apos;m interested in…
      </button>

      <ModalPortal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Email about this listing"
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-navy border border-white/10 shadow-2xl shadow-black/40 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <ContactFormPanel
            source="listing-interest"
            listingInfo={listingInfo}
            title="Get in touch"
            onDone={() => {
              window.setTimeout(() => setOpen(false), 1800);
            }}
          />
        </div>
      </ModalPortal>
    </>
  );
}
