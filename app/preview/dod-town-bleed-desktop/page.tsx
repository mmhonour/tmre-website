import Link from "next/link";
import { DodTownBleedStage } from "@/app/preview/dod-town-bleed/DodTownBleedStage";

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
          Full-bleed wash from the town name down to the town filter. Carousel
          cycles three paints: edges meet in the center, center lines paint
          out, then a line from the top paints down. Town 4 repeats the first
          paint.
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
      <DodTownBleedStage variant="desktop" />
    </div>
  );
}
