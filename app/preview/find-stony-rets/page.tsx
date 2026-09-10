import { FindStonyRetsPreview } from "./FindStonyRetsPreview";

export const metadata = {
  title: "Preview — Find RETS hops — TMRE",
  robots: { index: false, follow: false },
};

export default function FindStonyRetsPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Find RETS hops for 2A Stony Pt
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture Vision card for pid 5384. Shows the StreetNumber hops Find
          will send, the paid-deed Closed window (not the 2016 quitclaim), and
          whether Vision matches MLS <span className="whitespace-nowrap">2A-A</span>{" "}
          Stony Point Road. Probe RETS is read-only. Production:
          /find/westport/5384.
        </p>
        <FindStonyRetsPreview />
      </div>
    </div>
  );
}
