import { ListingOpenHouseHistoryPreview } from "./ListingOpenHouseHistoryPreview";

export const metadata = {
  title: "Preview — Listing open house history — TMRE",
  robots: { index: false, follow: false },
};

export default function ListingOpenHouseHistoryPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Open houses after History
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Stored SmartMLS open houses for this property sit under the MLS
          timeline. Upcoming vs held is stamped by the history API. A prior
          listing&apos;s dates stay when this home relists. Production: listing
          History.
        </p>
        <ListingOpenHouseHistoryPreview />
      </div>
    </div>
  );
}
