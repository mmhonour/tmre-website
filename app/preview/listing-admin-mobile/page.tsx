import { ListingAdminMobilePreview } from "./ListingAdminMobilePreview";

export const metadata = {
  title: "Preview — Listing Admin on mobile — TMRE",
  robots: { index: false, follow: false },
};

export default function ListingAdminMobilePreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-md px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Listing Admin on mobile
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Admin used to toggle a desktop card deck that is hidden below
          lg, so the tab did nothing on a phone. It now jumps to the
          Admin block under the map. Production: /listings/… (unlocked).
        </p>
        <ListingAdminMobilePreview />
      </div>
    </div>
  );
}
