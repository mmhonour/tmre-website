import MarketPulseWowPreviewClient from "./MarketPulseWowPreviewClient";
import {
  MARKET_PULSE_MOM_PRIOR_ROWS,
  MARKET_PULSE_MOM_PRIOR_SLOT,
  MARKET_PULSE_WOW_CURRENT_ROWS,
  MARKET_PULSE_WOW_PRIOR_ROWS,
  MARKET_PULSE_WOW_PRIOR_SLOT,
  MARKET_PULSE_YOY_PRIOR_ROWS,
  MARKET_PULSE_YOY_PRIOR_SLOT,
  snapshotFromCombinedRows,
} from "./fixtures";
import { buildMarketPulseWow } from "@/lib/market-pulse-wow";

export const metadata = {
  title: "Preview — Unstacked Week Over Week — TMRE",
  robots: { index: false, follow: false },
};

export default function MarketPulseWowPreviewPage() {
  const current = MARKET_PULSE_WOW_CURRENT_ROWS;
  const wow = buildMarketPulseWow(
    current,
    MARKET_PULSE_WOW_PRIOR_ROWS,
    MARKET_PULSE_WOW_PRIOR_SLOT,
  );
  const mom = buildMarketPulseWow(
    current,
    MARKET_PULSE_MOM_PRIOR_ROWS,
    MARKET_PULSE_MOM_PRIOR_SLOT,
  );
  const yoy = buildMarketPulseWow(
    current,
    MARKET_PULSE_YOY_PRIOR_ROWS,
    MARKET_PULSE_YOY_PRIOR_SLOT,
  );
  return (
    <MarketPulseWowPreviewClient
      snapshot={snapshotFromCombinedRows(current)}
      compares={{ wow, mom, yoy }}
      etDate="Monday, September 14, 2026"
    />
  );
}
