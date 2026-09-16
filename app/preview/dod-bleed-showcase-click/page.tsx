import { Suspense } from "react";
import Link from "next/link";
import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import { dodTownBleedFixtureDeals } from "@/app/preview/dod-town-bleed/fixture-deals";

export const metadata = {
  title: "Preview — DOD bleed → showcase — TMRE",
  robots: { index: false, follow: false },
};

export default function DodBleedShowcaseClickPreviewPage() {
  const dealsByTown = dodTownBleedFixtureDeals();

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-6 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · desktop
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Deal of the Day bleed → showcase
        </h1>
        <p className="mb-3 text-sm leading-relaxed text-slate">
          Full Deal of the Day page (carousel, town list, value-pick,
          insight) with fixture towns — no listing database. Click empty
          photo in the top-half bleed to open that listing’s showcase. Town
          names, the headline, and the value-pick keep their own clicks.
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          Full PR 167:{" "}
          <Link
            href="/preview/dod-town-bleed-desktop"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/dod-town-bleed-desktop
          </Link>
          {" · "}
          <Link
            href="/preview/dod-town-bleed-mobile"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/dod-town-bleed-mobile
          </Link>
        </p>
      </div>
      <Suspense fallback={null}>
        <DealOfTheWeekHero
          mode="day"
          lockSeed
          initialDealsByTown={dealsByTown}
          initialKind="sale"
          initialPropertyClass="homes"
        />
      </Suspense>
    </div>
  );
}
