import { OpenHousesForwardPreview } from "./OpenHousesForwardPreview";

export const metadata = {
  title: "Preview — Open houses remaining week — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesForwardPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Remaining week + load error
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Sunday 12:00 AM ET resets the page to Sunday–Saturday. Monday is
          Monday–Sunday; the rest of the week is today through Sunday. The
          hourly job still inventories today through today+6 for Admin and
          the page cache. A series that ended yesterday is out. A failed
          load is not an empty week — Try again retries. Production:
          /open-houses.
        </p>
        <OpenHousesForwardPreview />
      </div>
    </div>
  );
}
