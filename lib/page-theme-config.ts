import "server-only";

import { getSyncMeta as getSyncMetaFresh } from "@/lib/db/sync-meta";
import {
  deleteSyncMetaDurable,
  getSyncMeta,
  setSyncMetaDurable,
} from "@/lib/db/sync-meta-store";
import {
  builtinMarketPulsePresets,
  cloneMarketPulseTheme,
  DEFAULT_MARKET_PULSE_THEME,
  MARKET_PULSE_THEME_PRESETS,
  normalizeMarketPulseTheme,
  slugifyCustomPresetId,
  type MarketPulseTheme,
  type MarketPulseThemePreset,
} from "@/lib/page-theme-shared";

export {
  builtinMarketPulsePresets,
  cloneMarketPulseTheme,
  DEFAULT_MARKET_PULSE_THEME,
  MARKET_PULSE_FONT_OPTIONS,
  MARKET_PULSE_THEME_PRESETS,
  marketPulseThemeCssVars,
  slugifyCustomPresetId,
  type MarketPulseTheme,
  type MarketPulseThemePreset,
} from "@/lib/page-theme-shared";

/** Active Market Pulse theme — Neon sync_meta (per environment). */
export const MARKET_PULSE_THEME_SYNC_KEY = "page_theme:market-pulse";

/**
 * Custom named presets — Neon sync_meta only.
 * Never seeded from git, so a deploy / push from another env cannot overwrite them.
 */
export const MARKET_PULSE_CUSTOM_PRESETS_SYNC_KEY =
  "page_theme:market-pulse:custom-presets";

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

function parseCustomPresets(raw: string | null | undefined): MarketPulseThemePreset[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { presets?: unknown }
    if (!Array.isArray(parsed.presets)) return []
    const out: MarketPulseThemePreset[] = []
    for (const row of parsed.presets) {
      if (!row || typeof row !== "object") continue
      const candidate = row as Record<string, unknown>
      const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
      const label =
        typeof candidate.label === "string" ? candidate.label.trim() : ""
      if (!id.startsWith("custom-") || !label) continue
      const normalized = normalizeMarketPulseTheme(candidate.theme)
      if (!normalized.ok) continue
      out.push({
        id,
        label,
        theme: normalized.theme,
        source: "custom",
        createdAt:
          typeof candidate.createdAt === "string"
            ? candidate.createdAt
            : undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

export async function listCustomMarketPulsePresetsFresh(): Promise<
  MarketPulseThemePreset[]
> {
  try {
    return parseCustomPresets(
      await getSyncMetaFresh(MARKET_PULSE_CUSTOM_PRESETS_SYNC_KEY),
    )
  } catch {
    return parseCustomPresets(
      getSyncMeta(MARKET_PULSE_CUSTOM_PRESETS_SYNC_KEY),
    )
  }
}

async function writeCustomPresets(
  presets: MarketPulseThemePreset[],
): Promise<void> {
  await setSyncMetaDurable(
    MARKET_PULSE_CUSTOM_PRESETS_SYNC_KEY,
    JSON.stringify({
      presets: presets.map((p) => ({
        id: p.id,
        label: p.label,
        theme: p.theme,
        createdAt: p.createdAt ?? new Date().toISOString(),
      })),
    }),
  )
}

export async function createCustomMarketPulsePreset(input: {
  label: string
  theme: unknown
}): Promise<MarketPulseThemePreset> {
  const label = input.label.trim()
  if (label.length < 2 || label.length > 48) {
    throw new Error("Preset name must be 2–48 characters.")
  }
  const normalized = normalizeMarketPulseTheme(input.theme)
  if (!normalized.ok) throw new Error(normalized.error)

  const existing = await listCustomMarketPulsePresetsFresh()
  let id = slugifyCustomPresetId(label)
  if (existing.some((p) => p.id === id) || id in MARKET_PULSE_THEME_PRESETS) {
    let n = 2
    while (
      existing.some((p) => p.id === `${id}-${n}`) ||
      `${id}-${n}` in MARKET_PULSE_THEME_PRESETS
    ) {
      n += 1
    }
    id = `${id}-${n}`
  }

  const preset: MarketPulseThemePreset = {
    id,
    label,
    theme: normalized.theme,
    source: "custom",
    createdAt: new Date().toISOString(),
  }
  await writeCustomPresets([...existing, preset])
  return preset
}

export async function deleteCustomMarketPulsePreset(
  id: string,
): Promise<boolean> {
  const key = id.trim()
  if (!key.startsWith("custom-")) {
    throw new Error("Only custom presets can be deleted.")
  }
  const existing = await listCustomMarketPulsePresetsFresh()
  const next = existing.filter((p) => p.id !== key)
  if (next.length === existing.length) return false
  if (next.length === 0) {
    await deleteSyncMetaDurable(MARKET_PULSE_CUSTOM_PRESETS_SYNC_KEY)
  } else {
    await writeCustomPresets(next)
  }
  return true
}

export async function listAllMarketPulsePresetsFresh(): Promise<
  MarketPulseThemePreset[]
> {
  const custom = await listCustomMarketPulsePresetsFresh()
  return [...builtinMarketPulsePresets(), ...custom]
}
