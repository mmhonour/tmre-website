import Link from "next/link";
import { ShowcaseRailAroundArrowStage } from "@/app/preview/showcase-rail-around-arrow/ShowcaseRailAroundArrowStage";

export const metadata = {
  title: "Preview — Showcase rail mobile — TMRE",
  robots: { index: false, follow: false },
};

export default function ShowcaseRailMobilePreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-lg px-4 pb-8 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · mobile
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Showcase rail around the right arrow
        </h1>
        <p className="mb-3 text-sm leading-relaxed text-slate">
          Fixture only — 390×844 phone frame with the mobile site header
          (photo, TMRE lockup, hamburger) over the photo, same as a listing.
          Use it to see whether status, price, or maximize scrunch into the
          header. Same even glyph spacing as desktop. Tap the hamburger to
          open the menu. Toggle maximize for labels.
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
          <ShowcaseRailAroundArrowStage variant="mobile" />
        </div>
      </div>
    </div>
  );
}
