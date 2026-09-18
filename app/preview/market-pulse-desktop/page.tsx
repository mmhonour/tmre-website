import Link from "next/link";
import MarketPulseFullBoard from "@/app/preview/market-pulse-full/MarketPulseFullBoard";
import {
  MARKET_PULSE_FULL_COMPARES,
  MARKET_PULSE_FULL_ET_DATE,
  MARKET_PULSE_FULL_SNAPSHOT,
} from "@/app/preview/market-pulse-full/fixtures";

export const metadata = {
  title: "Preview — Market Pulse desktop — TMRE",
  robots: { index: false, follow: false },
};

export default function MarketPulseDesktopPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-6 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview · desktop
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Market Pulse — desktop
        </h1>
        <p className="mb-3 text-sm leading-relaxed text-slate">
          Full Market Pulse with every enhancement on: property type (ALL /
          Single Family / Condo / Rentals / Commercial), labeled yin-yang
          (Seller Friendly · tap → Buyer Friendly), lookback left of All
          Towns, unstacked heat first with all seven towns named left of the
          bars, Off / Week / Month / Year cream callouts, one-line floating
          KPIs. Fixture towns — not live cache. Toggle Stacked the same way
          /market-pulse does.
        </p>
        <p className="mb-6 font-mono text-[11px] text-slate">
          Phone:{" "}
          <Link
            href="/preview/market-pulse-mobile"
            className="text-navy underline decoration-gold/50 underline-offset-2"
          >
            /preview/market-pulse-mobile
          </Link>
        </p>
      </div>
      <MarketPulseFullBoard
        snapshot={MARKET_PULSE_FULL_SNAPSHOT}
        compares={MARKET_PULSE_FULL_COMPARES}
        etDate={MARKET_PULSE_FULL_ET_DATE}
      />
    </div>
  );
}
