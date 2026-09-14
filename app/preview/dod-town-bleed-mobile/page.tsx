import Link from "next/link";
import { DodTownBleedStage } from "@/app/preview/dod-town-bleed/DodTownBleedStage";

export const metadata = {
  title: "Preview — DOD town bleed mobile — TMRE",
  robots: { index: false, follow: false },
};

export default function DodTownBleedMobilePreviewPage() {
  return (
    <>
      <div className="lg:hidden">
        <DodTownBleedStage variant="mobile" chrome="site" />
      </div>
      <div className="hidden min-h-screen bg-cream lg:block">
        <div className="mx-auto max-w-lg px-4 pb-8 pt-28 sm:px-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            UI preview · mobile
          </p>
          <h1 className="mb-2 font-serif text-3xl text-navy">
            Deal of the Day town bleeds
          </h1>
          <p className="mb-3 text-sm leading-relaxed text-slate">
            Same three paints as desktop, full-bleed on a phone. On a laptop
            this URL keeps a 390×844 frame. On a phone it fills the screen.
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
          <div className="mx-auto w-[390px] overflow-hidden rounded-[1.75rem] border border-charcoal/15 shadow-[0_24px_60px_-28px_rgba(13,20,36,0.65)]">
            <DodTownBleedStage variant="mobile" chrome="fixture" />
          </div>
        </div>
      </div>
    </>
  );
}
