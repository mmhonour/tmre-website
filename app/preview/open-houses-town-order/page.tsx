import { OpenHousesTownOrderPreview } from "./OpenHousesTownOrderPreview";

export const metadata = {
  title: "Preview — Open houses town order — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesTownOrderPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Collapsed towns + your order
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Towns start collapsed (Close all towns engaged). Drag ⋮⋮ to reorder;
          the order is cookie tmre_oh_town_order (same as /open-houses). Reset
          clears it. Fixture week of 10 Sep 2026.
        </p>
        <OpenHousesTownOrderPreview />
      </div>
    </div>
  );
}
