import { OpenHousesViewGlyphsPreview } from "./OpenHousesViewGlyphsPreview";

export const metadata = {
  title: "Preview — Open houses Large / Grid / Line — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesViewGlyphsPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Large, Grid, and Line
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Open Houses view glyphs now match Intelligence: Large, Grid, Line —
          not Grid, Rows, Compact list. Click the picker; the fixture cards
          switch. Production: /open-houses.
        </p>
        <OpenHousesViewGlyphsPreview />
      </div>
    </div>
  );
}
