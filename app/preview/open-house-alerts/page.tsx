import { OpenHouseAlertsPreview } from "./OpenHouseAlertsPreview";

export const metadata = {
  title: "Preview — Open house + listing alerts — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHouseAlertsPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Open house and listing alerts
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Open Houses is titled for showings and can also include new listings.
          Latest keeps listing alerts and can add open houses — a new home may
          list before it has a showing. Same immediate / daily / weekly
          cadence. Production: /open-houses and /latest.
        </p>
        <OpenHouseAlertsPreview />
      </div>
    </div>
  );
}
