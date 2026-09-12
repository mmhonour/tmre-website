import { OpenHousesFocusPreview } from "./OpenHousesFocusPreview";

export const metadata = {
  title: "Preview — Open houses most / first showing — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesFocusPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Most open houses / first showing
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Show by is All, Most open houses (top 3 hosts per town, ties
          stay), or First showing (zero past). Production: /open-houses.
        </p>
        <OpenHousesFocusPreview />
      </div>
    </div>
  );
}
