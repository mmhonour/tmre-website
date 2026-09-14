import Link from "next/link";
import { ShowcaseRailAroundArrowStage } from "@/app/preview/showcase-rail-around-arrow/ShowcaseRailAroundArrowStage";

export const metadata = {
  title: "Preview — Showcase rail desktop — TMRE",
  robots: { index: false, follow: false },
};

export default function ShowcaseRailDesktopPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-6 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · desktop
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Showcase rail around the right arrow
        </h1>
        <p className="mb-3 text-sm leading-relaxed text-slate">
          Fixture only. The right photo arrow stays on the vertical midpoint.
          Maximize, Insight, Details, and Comps sit above it; What if, Town
          pulse, and Map sit below. The gap from Comps to the arrow equals
          the gap from the arrow to What if, and that same gap runs through
          the rest of the column. Price stays top-right. Toggle maximize to
          read the labels.
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          Phone frame:{" "}
          <Link
            href="/preview/showcase-rail-mobile"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/showcase-rail-mobile
          </Link>
        </p>
      </div>
      <ShowcaseRailAroundArrowStage variant="desktop" />
    </div>
  );
}
