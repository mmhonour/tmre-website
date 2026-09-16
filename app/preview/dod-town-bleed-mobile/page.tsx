import Link from "next/link";
import { DodTownBleedLive } from "@/app/preview/dod-town-bleed/DodTownBleedLive";
import { DodTownBleedTownBoard } from "@/app/preview/dod-town-bleed/DodTownBleedTownBoard";
import { loadDodTownBleedPreviewSeed } from "@/app/preview/dod-town-bleed/preview-seed";

export const metadata = {
  title: "Preview — DOD mobile — TMRE",
  robots: { index: false, follow: false },
};

export default async function DodTownBleedMobilePreviewPage() {
  const seed = await loadDodTownBleedPreviewSeed();
  const sourceLine =
    seed.source === "live"
      ? "This week’s live picks (same cache as /deal-of-the-day)."
      : "Fixture towns with listing photos — no listing database on this preview.";

  return (
    <>
      <div className="lg:hidden">
        <DodTownBleedLive seed={seed} />
        <div className="bg-cream pt-8">
          <DodTownBleedTownBoard seed={seed} />
        </div>
      </div>
      <div className="hidden min-h-screen bg-cream lg:block">
        <div className="mx-auto max-w-lg px-4 pb-8 pt-28 sm:px-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            UI preview · mobile · PR 167
          </p>
          <h1 className="mb-2 font-serif text-3xl text-navy">
            Deal of the Day — mobile
          </h1>
          <p className="mb-3 text-sm leading-relaxed text-slate">
            Full working phone page in this frame. “Today’s score / One
            listing” sits above the listing-photo bleed. Pause · town ·
            For Sale sits in the band, insight directly under the carousel,
            value-pick with no photo and no second carousel. {sourceLine}{" "}
            On a phone this URL is full-bleed under the live header.
          </p>
          <p className="mb-6 font-mono text-[11px] text-slate">
            Desktop:{" "}
            <Link
              href="/preview/dod-town-bleed-desktop"
              className="text-navy underline decoration-gold/50 underline-offset-2"
            >
              /preview/dod-town-bleed-desktop
            </Link>
          </p>
          <div className="mx-auto h-[844px] w-[390px] overflow-y-auto overflow-x-hidden rounded-[1.75rem] border border-charcoal/15 shadow-[0_24px_60px_-28px_rgba(13,20,36,0.65)]">
            <DodTownBleedLive seed={seed} forcePhoneLayout />
          </div>
        </div>
        <DodTownBleedTownBoard seed={seed} />
      </div>
    </>
  );
}
