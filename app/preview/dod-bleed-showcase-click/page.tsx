import Link from "next/link";
import { DodBleedShowcaseClickStage } from "@/app/preview/dod-bleed-showcase-click/DodBleedShowcaseClickStage";

export const metadata = {
  title: "Preview — DOD bleed → showcase — TMRE",
  robots: { index: false, follow: false },
};

export default function DodBleedShowcaseClickPreviewPage() {
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
          Fixture only — no listing database. Click empty photo in the top-half
          bleed to open the listing showcase. Town names, the headline, and
          the value-pick must stay on this page.
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          Live page:{" "}
          <Link
            href="/deal-of-the-day"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /deal-of-the-day
          </Link>
          {" · "}
          Live bleed:{" "}
          <Link
            href="/preview/dod-town-bleed-desktop"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/dod-town-bleed-desktop
          </Link>
        </p>
      </div>
      <DodBleedShowcaseClickStage />
    </div>
  );
}
