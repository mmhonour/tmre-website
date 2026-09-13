import { ListingMapTownPinPreview } from "./ListingMapTownPinPreview";

export const metadata = {
  title: "Preview — Listing map town pin — TMRE",
  robots: { index: false, follow: false },
};

export default function ListingMapTownPinPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-4xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Listing map — town pin
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          When the MLS pin sits outside the listing&apos;s town zip outline, the
          listing map plots a Census geocode of street + city + state + zip.
          Stored MLS <code>latitude</code>/<code>longitude</code> stay as-is.
          Toggle the fixtures — 36 Lyons Plain is the real Matrix miss.
        </p>
        <ListingMapTownPinPreview />
      </div>
    </div>
  );
}
