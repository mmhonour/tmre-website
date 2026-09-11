import { OpenHousesNextOhPreview } from "./OpenHousesNextOhPreview";

export const metadata = {
  title: "Preview — Open houses next OH + alerts — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesNextOhPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Next open house + listing alerts
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Next-OH mark (black on white): grid upper-right, rows upper-right,
          compact right-aligned. Rows hero stretches to the row height. Alerts
          use
          recent Intelligence searches, or town + home type + price when none
          exist. Production: /open-houses.
        </p>
        <OpenHousesNextOhPreview />
      </div>
    </div>
  );
}
