import Link from "next/link";
import { ShowcaseRailAroundArrowStage } from "@/app/preview/showcase-rail-around-arrow/ShowcaseRailAroundArrowStage";

export const metadata = {
  title: "Preview — Showcase rail mobile — TMRE",
  robots: { index: false, follow: false },
};

export default function ShowcaseRailMobilePreviewPage() {
  return (
    <>
      {/*
        On a phone this URL is the preview: full-bleed under the real site
        header. The cream + 390 frame is only for looking at a laptop.
      */}
      <div className="lg:hidden">
        <ShowcaseRailAroundArrowStage variant="mobile" chrome="site" />
      </div>
      <div className="hidden min-h-screen bg-cream lg:block">
        <div className="mx-auto max-w-lg px-4 pb-8 pt-28 sm:px-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            UI preview · mobile
          </p>
          <h1 className="mb-2 font-serif text-3xl text-navy">
            Showcase rail around the right arrow
          </h1>
          <p className="mb-3 text-sm leading-relaxed text-slate">
            On a phone, this same URL is full-bleed under the live header —
            open it there to check scrunching. This laptop view keeps a
            390×844 frame with a fixture header.
          </p>
          <p className="mb-6 font-mono text-[11px] text-slate">
            Desktop:{" "}
            <Link
              href="/preview/showcase-rail-desktop"
              className="text-navy underline decoration-gold/50 underline-offset-2"
            >
              /preview/showcase-rail-desktop
            </Link>
          </p>
          <div className="mx-auto w-[390px] overflow-hidden rounded-[1.75rem] border border-charcoal/15 shadow-[0_24px_60px_-28px_rgba(13,20,36,0.65)]">
            <ShowcaseRailAroundArrowStage variant="mobile" chrome="fixture" />
          </div>
        </div>
      </div>
    </>
  );
}
