import "server-only";

import { getSyncMeta as getSyncMetaFresh } from "@/lib/db/sync-meta";
import { getSyncMeta, setSyncMetaDurable } from "@/lib/db/sync-meta-store";
import {
  cloneMarketPulseTheme,
  DEFAULT_MARKET_PULSE_THEME,
  normalizeMarketPulseTheme,
  type MarketPulseTheme,
} from "@/lib/page-theme-shared";

export {
  cloneMarketPulseTheme,
  DEFAULT_MARKET_PULSE_THEME,
  MARKET_PULSE_FONT_OPTIONS,
  MARKET_PULSE_THEME_PRESETS,
  marketPulseThemeCssVars,
  type MarketPulseTheme,
} from "@/lib/page-theme-shared";

export const MARKET_PULSE_THEME_SYNC_KEY = "page_theme:market-pulse";

function parseTheme(raw: string | null | undefined): MarketPulseTheme {
  if (!raw) return cloneMarketPulseTheme();
  try {
    const normalized = normalizeMarketPulseTheme(JSON.parse(raw));
    return normalized.ok ? normalized.theme : cloneMarketPulseTheme();
  } catch {
    return cloneMarketPulseTheme();
  }
}

export function getMarketPulseTheme(): MarketPulseTheme {
  return parseTheme(getSyncMeta(MARKET_PULSE_THEME_SYNC_KEY));
}

export async function getMarketPulseThemeFresh(): Promise<MarketPulseTheme> {
  try {
    return parseTheme(await getSyncMetaFresh(MARKET_PULSE_THEME_SYNC_KEY));
  } catch {
    return getMarketPulseTheme();
  }
}

export async function setMarketPulseTheme(
  input: unknown,
): Promise<MarketPulseTheme> {
  const normalized = normalizeMarketPulseTheme(input);
  if (!normalized.ok) throw new Error(normalized.error);
  await setSyncMetaDurable(
    MARKET_PULSE_THEME_SYNC_KEY,
    JSON.stringify(normalized.theme),
  );
  return normalized.theme;
}

export function isDefaultMarketPulseTheme(theme: MarketPulseTheme): boolean {
  return (
    JSON.stringify(theme) === JSON.stringify(DEFAULT_MARKET_PULSE_THEME)
  );
}
