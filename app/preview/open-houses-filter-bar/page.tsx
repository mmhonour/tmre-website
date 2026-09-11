import { OpenHousesFilterBarPreview } from "./OpenHousesFilterBarPreview";

export const metadata = {
  title: "Preview — Open houses filter bar — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesFilterBarPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-6xl px-4 pb-4 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Hero place filters + sticky bar
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Sale / rental and towns start in the navy hero. Scroll until they
          dock into the cream bar. Most / First are exclusive and sit on their
          own line. Open house alerts left, view glyphs right. Production:
          /open-houses.
        </p>
      </div>
      <OpenHousesFilterBarPreview />
    </div>
  );
}
