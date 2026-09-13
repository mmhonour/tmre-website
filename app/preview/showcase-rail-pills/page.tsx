import { ShowcaseRailPillsPreview } from "./ShowcaseRailPillsPreview";

export const metadata = {
  title: "Preview — Listing full-bleed rail pills — TMRE",
  robots: { index: false, follow: false },
};

export default function ShowcaseRailPillsPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Listing full-bleed rail pills
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture only — no live MLS. Page load is symbols only. Insight sits
          above Comps; Comps sits left of What if. Details, Map, and Town
          pulse stack on the right. One Details icon opens Summary / Full
          tabs. Navy wash behind status, address, and Offered at / Closed at.
        </p>
        <ShowcaseRailPillsPreview />
      </div>
    </div>
  );
}
