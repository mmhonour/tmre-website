"use client";

import ListingThumbImage from "@/components/ListingThumbImage";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
import { useState } from "react";

const MLS = "24201214";

const FRAMES = [
  { id: "grid", label: "Grid card", box: "h-[8.51rem] w-[17rem]" },
  { id: "large", label: "Large card", box: "h-[10.5rem] w-[10.5rem]" },
  { id: "line", label: "Line row", box: "h-[2.7rem] w-[3.6rem]" },
] as const;

function Frame({
  title,
  src,
  box,
  onMeta,
}: {
  title: string;
  src: string;
  box: string;
  onMeta: (text: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
        {title}
      </p>
      <div
        className={`relative overflow-hidden rounded-lg border border-charcoal/[0.08] bg-cream ${box}`}
      >
        <ListingThumbImage
          src={src}
          priority
          className="relative block h-full w-full overflow-hidden"
          imgClassName="block h-full w-full object-cover"
          onNaturalSize={(w, h) => onMeta(`${w}×${h}`)}
          onFailed={() => onMeta("failed")}
        />
      </div>
    </div>
  );
}

export function ListingCardPhotoPreview() {
  const mid = listingPhotoProxyUrl(MLS, 0);
  const full = listingPhotoProxyUrl(MLS, 0, { size: "full" });
  const [midMeta, setMidMeta] = useState("loading…");
  const [fullMeta, setFullMeta] = useState("loading…");

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Mid-size card photos
        </h1>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-slate">
          Cards site-wide were requesting the MLS full file (often 3072×2048)
          and smashing it into a Grid / Large / Line box. That is what put the
          curled stripe on roofs and siding. Default card URL is now{" "}
          <code className="font-mono text-[12px]">?size=mid</code>. Gallery
          keeps <code className="font-mono text-[12px]">?size=full</code>.
          Fixture MLS {MLS}.
        </p>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
              After — mid
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate/70">{mid}</p>
            <p className="mt-1 text-sm text-navy">{midMeta}</p>
            <div className="mt-5 flex flex-col gap-6">
              {FRAMES.map((frame) => (
                <Frame
                  key={`mid-${frame.id}`}
                  title={frame.label}
                  src={mid}
                  box={frame.box}
                  onMeta={setMidMeta}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
              Before — full in the same box
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate/70">{full}</p>
            <p className="mt-1 text-sm text-navy">{fullMeta}</p>
            <div className="mt-5 flex flex-col gap-6">
              {FRAMES.map((frame) => (
                <Frame
                  key={`full-${frame.id}`}
                  title={frame.label}
                  src={full}
                  box={frame.box}
                  onMeta={setFullMeta}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
