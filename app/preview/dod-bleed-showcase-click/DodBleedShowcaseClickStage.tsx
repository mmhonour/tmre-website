"use client";

import { useState } from "react";
import DealDayTownBleed from "@/components/DealDayTownBleed";
import { DealDayBleedShowcaseLink } from "@/components/DealDayBleedShowcaseLink";
import { listingDetailHref } from "@/lib/listing-url";

export const DOD_BLEED_SHOWCASE_FIXTURE = {
  mlsId: "24199886",
  street: "12 Main",
  town: "Westport",
  score: 77.3,
} as const;

const TOWNS = ["Westport", "Norwalk", "Darien"] as const;

export function DodBleedShowcaseClickStage() {
  const href = listingDetailHref(
    DOD_BLEED_SHOWCASE_FIXTURE.mlsId,
    DOD_BLEED_SHOWCASE_FIXTURE.street,
    DOD_BLEED_SHOWCASE_FIXTURE.town,
  );
  const [lastHit, setLastHit] = useState<"town" | "headline" | "value-pick" | null>(
    null,
  );

  return (
    <div className="navy-gradient">
      <div className="relative h-[50dvh] min-h-[20rem] overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[linear-gradient(155deg,#2a354c_0%,#6d7a92_42%,#b7a078_100%)]" />
          <DealDayTownBleed
            layout="hero"
            carouselIndex={0}
            playOnMount
            photoUrl={null}
            photoAlt=""
          />
        </div>
        <DealDayBleedShowcaseLink
          href={href}
          address={`${DOD_BLEED_SHOWCASE_FIXTURE.street}, ${DOD_BLEED_SHOWCASE_FIXTURE.town}`}
          mlsId={DOD_BLEED_SHOWCASE_FIXTURE.mlsId}
          className="absolute inset-0 z-[1]"
        />
        <div className="pointer-events-none relative z-[2] flex h-full max-w-xl flex-col justify-start px-10 pt-10">
          <div className="pointer-events-auto w-fit rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 font-mono text-[11px] tracking-[0.2em] text-gold/90">
            Deal of the Day
          </div>
          <div className="pointer-events-auto mt-3 w-fit font-mono text-[10px] uppercase tracking-[0.15em]">
            {TOWNS.map((town, i) => (
              <span key={town}>
                {i === 0 ? null : (
                  <span className="text-white/45">{i === TOWNS.length - 1 ? ", and " : ", "}</span>
                )}
                <button
                  type="button"
                  onClick={() => setLastHit("town")}
                  className={
                    town === DOD_BLEED_SHOWCASE_FIXTURE.town
                      ? "text-gold"
                      : "text-white/70 hover:text-white"
                  }
                >
                  {town}
                </button>
              </span>
            ))}
          </div>
          <h1 className="pointer-events-auto mt-3 w-fit font-serif text-5xl leading-[1.05] tracking-tight text-white lg:text-6xl">
            <button
              type="button"
              onClick={() => setLastHit("headline")}
              className="text-left"
            >
              Today&apos;s{" "}
              <span className="italic gold-shimmer">
                {DOD_BLEED_SHOWCASE_FIXTURE.score}.
              </span>
              <br />
              <span className="italic text-white/85">One listing.</span>
            </button>
          </h1>
        </div>
        <div className="pointer-events-auto absolute bottom-8 right-10 z-[2] w-[min(100%,20rem)] rounded-3xl border border-white/10 bg-navy-light/80 p-6 shadow-2xl backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLastHit("value-pick")}
            className="w-full text-left"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
              Value Pick
            </p>
            <p className="mt-2 font-serif text-2xl text-white">
              {DOD_BLEED_SHOWCASE_FIXTURE.street}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {DOD_BLEED_SHOWCASE_FIXTURE.town}
            </p>
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-6 py-6">
        <p className="font-mono text-[11px] text-white/70">
          Empty bleed →{" "}
          <span className="text-gold">{href}</span> (showcase). Town names,
          headline, and value-pick stay on this page.
        </p>
        <p className="mt-2 font-mono text-[11px] text-white/50">
          Last text/card click: {lastHit ?? "none yet"}
        </p>
      </div>
    </div>
  );
}
