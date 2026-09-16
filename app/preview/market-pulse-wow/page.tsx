import MarketPulseWowPreviewClient from "./MarketPulseWowPreviewClient";
import {
  MARKET_PULSE_MOM_PRIOR_ROWS,
  MARKET_PULSE_MOM_PRIOR_SLOT,
  MARKET_PULSE_WOW_CURRENT_ROWS,
  MARKET_PULSE_WOW_PRIOR_ROWS,
  MARKET_PULSE_WOW_PRIOR_SLOT,
} from "./fixtures";
import { buildMarketPulseWow } from "@/lib/market-pulse-wow";

export const metadata = {
  title: "Preview — Market Pulse week change — TMRE",
  robots: { index: false, follow: false },
};

export default function MarketPulseWowPreviewPage() {
  const wow = buildMarketPulseWow(
    MARKET_PULSE_WOW_CURRENT_ROWS,
    MARKET_PULSE_WOW_PRIOR_ROWS,
    MARKET_PULSE_WOW_PRIOR_SLOT,
  );
  const mom = buildMarketPulseWow(
    MARKET_PULSE_WOW_CURRENT_ROWS,
    MARKET_PULSE_MOM_PRIOR_ROWS,
    MARKET_PULSE_MOM_PRIOR_SLOT,
  );
  return (
    <MarketPulseWowPreviewClient
      current={MARKET_PULSE_WOW_CURRENT_ROWS}
      compares={{ wow, mom, yoy: null }}
    />
  );
}
