import MarketPulseWowPreviewClient from "./MarketPulseWowPreviewClient";
import {
  MARKET_PULSE_WOW_CURRENT_ROWS,
  MARKET_PULSE_WOW_PRIOR_ROWS,
  MARKET_PULSE_WOW_PRIOR_SLOT,
} from "./fixtures";
import { buildMarketPulseWow } from "@/lib/market-pulse-wow";

export const metadata = {
  title: "Preview — Market Pulse WoW — TMRE",
  robots: { index: false, follow: false },
};

export default function MarketPulseWowPreviewPage() {
  const wow = buildMarketPulseWow(
    MARKET_PULSE_WOW_CURRENT_ROWS,
    MARKET_PULSE_WOW_PRIOR_ROWS,
    MARKET_PULSE_WOW_PRIOR_SLOT,
  );
  return (
    <MarketPulseWowPreviewClient
      current={MARKET_PULSE_WOW_CURRENT_ROWS}
      wow={wow}
    />
  );
}
