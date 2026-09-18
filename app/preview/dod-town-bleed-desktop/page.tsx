import Link from "next/link";
import { DodTownBleedLive } from "@/app/preview/dod-town-bleed/DodTownBleedLive";
import { DodTownBleedTownBoard } from "@/app/preview/dod-town-bleed/DodTownBleedTownBoard";
import { loadDodTownBleedPreviewSeed } from "@/app/preview/dod-town-bleed/preview-seed";

export const metadata = {
  title: "Preview — DOD desktop — TMRE",
  robots: { index: false, follow: false },
};

export default async function DodTownBleedDesktopPreviewPage() {
  const seed = await loadDodTownBleedPreviewSeed();
  const sourceLine =
    seed.source === "live"
      ? "This week’s live picks (same cache as /deal-of-the-day)."
      : "Fixture towns with listing photos — no listing database on this preview.";

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-6 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · desktop · PR 167
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Deal of the Day — desktop
        </h1>
        <p className="mb-3 text-sm leading-relaxed text-slate">
          Full working page: listing-photo bleed across the top half,
          pause · town · For Sale directly under the bleed, insight
          directly under the carousel, value-pick starting at the
          bleed’s bottom then rising to sit under the site header (top of
          the bleed below the menus). Click empty photo (not
          the headline, town names, or value-pick) to open that
          listing’s showcase. The next-town arrow stays put for the
          widest town name. {sourceLine}
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          Phone:{" "}
          <Link
            href="/preview/dod-town-bleed-mobile"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/dod-town-bleed-mobile
          </Link>
          {" · "}
          Live:{" "}
          <Link
            href="/deal-of-the-day"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /deal-of-the-day
          </Link>
        </p>
      </div>
      <DodTownBleedLive seed={seed} />
      <div className="bg-cream pt-10">
        <DodTownBleedTownBoard seed={seed} />
      </div>
    </div>
  );
}
