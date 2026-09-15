import Link from "next/link";
import { DodTownBleedLive } from "@/app/preview/dod-town-bleed/DodTownBleedLive";
import { DodTownBleedTownBoard } from "@/app/preview/dod-town-bleed/DodTownBleedTownBoard";

export const metadata = {
  title: "Preview — DOD town bleed desktop — TMRE",
  robots: { index: false, follow: false },
};

export default function DodTownBleedDesktopPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-6 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · desktop
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Deal of the Day town bleeds
        </h1>
        <p className="mb-3 text-sm leading-relaxed text-slate">
          Live weekly picks — same data as{" "}
          <Link
            href="/deal-of-the-day"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /deal-of-the-day
          </Link>
          . On desktop the listing photo is a home-page-style full bleed
          across the top half of the viewport. The value-pick panel starts
          at the bottom of that bleed, flips with each town, then rises
          slowly so you can see the photo first. Stills for every town are
          below. Use ‹ › to step towns.
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          Phone:{" "}
          <Link
            href="/preview/dod-town-bleed-mobile"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/dod-town-bleed-mobile
          </Link>
        </p>
      </div>
      <DodTownBleedLive />
      <div className="bg-cream pt-10">
        <DodTownBleedTownBoard />
      </div>
    </div>
  );
}
