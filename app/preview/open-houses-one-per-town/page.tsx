import { OpenHousesOnePerTownPreview } from "./OpenHousesOnePerTownPreview";

export const metadata = {
  title: "Preview — Open houses one per town — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesOnePerTownPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          One listing per town
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Test cap for page load: fixture week with exactly one home in each
          coverage town. Towns start collapsed. Production: /open-houses.
        </p>
        <OpenHousesOnePerTownPreview />
      </div>
    </div>
  );
}
