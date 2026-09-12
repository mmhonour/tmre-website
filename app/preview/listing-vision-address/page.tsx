import { ListingVisionAddressPreview } from "./ListingVisionAddressPreview";

export const metadata = {
  title: "Preview — Listing address to Vision card — TMRE",
  robots: { index: false, follow: false },
};

export default function ListingVisionAddressPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Listing address → Vision card
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Unlocked (admin) visitors can click the street. A stamped PID opens
          the Find parcel page. No match opens Find search so you can see
          whether VGSI has a card. Locked visitors get plain text. Production:
          /listings/…
        </p>
        <ListingVisionAddressPreview />
      </div>
    </div>
  );
}
