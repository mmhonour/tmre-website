import { OpenHousesTownDayPreview } from "./OpenHousesTownDayPreview";

export const metadata = {
  title: "Preview — Open houses by town and day — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesTownDayPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Open houses by town and day
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture week of 10 Sep 2026 (Mon 7–Sun 13). Town count is unique
          homes; 16 Sea Spray has three open houses this week. +/− collapses a
          town. Production: /open-houses.
        </p>
        <OpenHousesTownDayPreview />
      </div>
    </div>
  );
}
