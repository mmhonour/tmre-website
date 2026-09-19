import Link from "next/link";
import MarketPulseFullBoard from "@/app/preview/market-pulse-full/MarketPulseFullBoard";
import {
  MARKET_PULSE_FULL_COMPARES,
  MARKET_PULSE_FULL_ET_DATE,
  MARKET_PULSE_FULL_SNAPSHOT,
} from "@/app/preview/market-pulse-full/fixtures";

export const metadata = {
  title: "Preview — Market Pulse mobile — TMRE",
  robots: { index: false, follow: false },
};

export default function MarketPulseMobilePreviewPage() {
  const board = (
    <MarketPulseFullBoard
      snapshot={MARKET_PULSE_FULL_SNAPSHOT}
      compares={MARKET_PULSE_FULL_COMPARES}
      etDate={MARKET_PULSE_FULL_ET_DATE}
    />
  );

  return (
    <>
      <div className="lg:hidden">
        <div className="px-4 pb-4 pt-24">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            UI preview · mobile
          </p>
          <p className="text-sm leading-relaxed text-slate">
            Same full Market Pulse as desktop, phone chrome. One FILTER chip
            opens Type, Tracing, and Lookback as tabs. Scroll to pin the KPIs —
            the town line reads Norwalk vs All Towns. Homes · Inventory · Days
            on Market stay on one line.
          </p>
        </div>
        {board}
      </div>
      <div className="hidden min-h-screen bg-cream lg:block">
        <div className="mx-auto max-w-lg px-4 pb-8 pt-28 sm:px-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            UI preview · mobile
          </p>
          <h1 className="mb-2 font-serif text-3xl text-navy">
            Market Pulse — mobile
          </h1>
          <p className="mb-3 text-sm leading-relaxed text-slate">
          Full working phone page in this frame: one FILTER chip opens a
          drawer with Type, Tracing (Off / Week / Month / Year), and Lookback
          tabs. Stacked and the ? stay on the bar. Scroll updates the town in
          the pin as{" "}
          <span className="whitespace-nowrap">Norwalk vs All Towns</span>.
          On a phone this URL is full-bleed under the live header.
          </p>
          <p className="mb-6 font-mono text-[11px] text-slate">
            Desktop:{" "}
            <Link
              href="/preview/market-pulse-desktop"
              className="text-navy underline decoration-gold/50 underline-offset-2"
            >
              /preview/market-pulse-desktop
            </Link>
          </p>
          <div className="mx-auto h-[844px] w-[390px] overflow-y-auto overflow-x-hidden rounded-[1.75rem] border border-charcoal/15 shadow-[0_24px_60px_-28px_rgba(13,20,36,0.65)]">
            {board}
          </div>
        </div>
      </div>
    </>
  );
}
