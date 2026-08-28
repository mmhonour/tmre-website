export const MARKET_PULSE_FONT_OPTIONS = {
  serif: {
    label: "Playfair Display",
    value: "var(--font-playfair), Georgia, serif",
  },
  sans: {
    label: "DM Sans",
    value: "var(--font-dm-sans), system-ui, sans-serif",
  },
  mono: {
    label: "JetBrains Mono",
    value: "var(--font-jetbrains), ui-monospace, monospace",
  },
} as const;

export type MarketPulseFontId = keyof typeof MARKET_PULSE_FONT_OPTIONS;

export type MarketPulseTheme = {
  pageBackground: string;
  cardBackground: string;
  surface: string;
  surfaceDeep: string;
  accent: string;
  text: string;
  mutedText: string;
  inventoryBar: string;
  monthsSupplyBar: string;
  headingFont: MarketPulseFontId;
  bodyFont: MarketPulseFontId;
  monoFont: MarketPulseFontId;
};

export const DEFAULT_MARKET_PULSE_THEME: MarketPulseTheme = {
  pageBackground: "#0A1020",
  cardBackground: "#0D1424",
  surface: "#1B2A4A",
  surfaceDeep: "#131F38",
  accent: "#C8A951",
  text: "#F1F4FA",
  mutedText: "#8C9AB4",
  inventoryBar: "#2A3D6B",
  monthsSupplyBar: "#C8A951",
  headingFont: "serif",
  bodyFont: "sans",
  monoFont: "mono",
};

export type MarketPulseThemePreset = {
  id: string
  label: string
  theme: MarketPulseTheme
  /** Built-ins ship in git; custom presets live in Postgres per environment. */
  source: "builtin" | "custom"
  createdAt?: string
}

export const MARKET_PULSE_THEME_PRESETS: Record<
  string,
  { label: string; theme: MarketPulseTheme }
> = {
  default: { label: "TMRE default", theme: DEFAULT_MARKET_PULSE_THEME },
  "ink-brass": {
    label: "Ink & brass",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#E9E8E2",
      surface: "#142033",
      surfaceDeep: "#0D1624",
      accent: "#B9964A",
      text: "#142033",
      mutedText: "#555A60",
      inventoryBar: "#31465C",
    },
  },
  "harbor-slate": {
    label: "Harbor slate",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#EAF0F3",
      cardBackground: "#FCFDFE",
      surface: "#20394D",
      surfaceDeep: "#162B3B",
      accent: "#B28B42",
      text: "#20394D",
      mutedText: "#536773",
      inventoryBar: "#416B83",
      monthsSupplyBar: "#A87D38",
    },
  },
  "forest-ledger": {
    label: "Forest ledger",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#EEF1EC",
      cardBackground: "#FCFDF9",
      surface: "#19352F",
      surfaceDeep: "#10261F",
      accent: "#B9964A",
      text: "#19352F",
      mutedText: "#5B665E",
      inventoryBar: "#3E7163",
      monthsSupplyBar: "#B9964A",
    },
  },
  "coastal-mist": {
    label: "Coastal mist",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#E8F0F2",
      cardBackground: "#FFFFFF",
      surface: "#1A3340",
      surfaceDeep: "#12242E",
      accent: "#C4A46A",
      text: "#1A3340",
      mutedText: "#5A6E76",
      inventoryBar: "#3A6A7A",
      monthsSupplyBar: "#C4A46A",
      headingFont: "serif",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "graphite-gilt": {
    label: "Graphite & gilt",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#E6E7EA",
      cardBackground: "#F7F8FA",
      surface: "#1C1F26",
      surfaceDeep: "#12141A",
      accent: "#D4AF37",
      text: "#1C1F26",
      mutedText: "#5C616A",
      inventoryBar: "#3A4050",
      monthsSupplyBar: "#D4AF37",
      headingFont: "sans",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "stone-olive": {
    label: "Stone & olive",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#F0EFE8",
      cardBackground: "#FFFEFA",
      surface: "#2C3328",
      surfaceDeep: "#1C2219",
      accent: "#A68B4B",
      text: "#2C3328",
      mutedText: "#64685C",
      inventoryBar: "#5A6B4E",
      monthsSupplyBar: "#A68B4B",
      headingFont: "serif",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "blizzard-ink": {
    label: "Blizzard & ink",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#F4F6F8",
      cardBackground: "#FFFFFF",
      surface: "#0F1724",
      surfaceDeep: "#0A1018",
      accent: "#C8A951",
      text: "#0F1724",
      mutedText: "#5A6570",
      inventoryBar: "#243044",
      monthsSupplyBar: "#C8A951",
      headingFont: "sans",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "espresso-gilt": {
    label: "Espresso & gilt",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#F3EDE6",
      cardBackground: "#FFFCF8",
      surface: "#2A1F18",
      surfaceDeep: "#1A1310",
      accent: "#C9A227",
      text: "#2A1F18",
      mutedText: "#6B5E52",
      inventoryBar: "#5C4033",
      monthsSupplyBar: "#C9A227",
      headingFont: "serif",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "copper-night": {
    label: "Copper night",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#ECE8E4",
      cardBackground: "#FAF8F6",
      surface: "#1E242B",
      surfaceDeep: "#12171C",
      accent: "#B87333",
      text: "#1E242B",
      mutedText: "#5E646C",
      inventoryBar: "#3D4A56",
      monthsSupplyBar: "#B87333",
      headingFont: "serif",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "sage-ledger": {
    label: "Sage ledger",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#EBF0EC",
      cardBackground: "#FBFDFB",
      surface: "#24362E",
      surfaceDeep: "#17241E",
      accent: "#C2A15A",
      text: "#24362E",
      mutedText: "#5A6A60",
      inventoryBar: "#4A7A66",
      monthsSupplyBar: "#C2A15A",
      headingFont: "serif",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "steel-amber": {
    label: "Steel & amber",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#E9ECF0",
      cardBackground: "#FFFFFF",
      surface: "#252A33",
      surfaceDeep: "#171B22",
      accent: "#E0A84A",
      text: "#252A33",
      mutedText: "#5C646E",
      inventoryBar: "#4A5568",
      monthsSupplyBar: "#E0A84A",
      headingFont: "sans",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
  "parchment-navy": {
    label: "Parchment navy",
    theme: {
      ...DEFAULT_MARKET_PULSE_THEME,
      pageBackground: "#F2EFE6",
      cardBackground: "#FFFDF8",
      surface: "#1B2A4A",
      surfaceDeep: "#121C33",
      accent: "#C8A951",
      text: "#1B2A4A",
      mutedText: "#6A6558",
      inventoryBar: "#2A3D6B",
      monthsSupplyBar: "#C8A951",
      headingFont: "serif",
      bodyFont: "sans",
      monoFont: "mono",
    },
  },
};

export function builtinMarketPulsePresets(): MarketPulseThemePreset[] {
  return Object.entries(MARKET_PULSE_THEME_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    theme: cloneMarketPulseTheme(preset.theme),
    source: "builtin" as const,
  }))
}

/** Stable id for a custom preset label (prefixed so it never clashes with builtins). */
export function slugifyCustomPresetId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return `custom-${base || "preset"}`
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function cloneMarketPulseTheme(
  theme: MarketPulseTheme = DEFAULT_MARKET_PULSE_THEME,
): MarketPulseTheme {
  return { ...theme };
}

export function normalizeMarketPulseTheme(
  value: unknown,
): { ok: true; theme: MarketPulseTheme } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "A complete Market Pulse theme is required." };
  }
  const candidate = value as Record<string, unknown>;
  const colors = Object.keys(DEFAULT_MARKET_PULSE_THEME).filter(
    (key) => key.endsWith("Background") || key.endsWith("Bar") || !key.endsWith("Font"),
  ) as (keyof MarketPulseTheme)[];
  const theme = { ...DEFAULT_MARKET_PULSE_THEME } as MarketPulseTheme;

  for (const key of colors) {
    const color = candidate[key];
    if (typeof color !== "string" || !HEX.test(color)) {
      return { ok: false, error: `${key} must be a six-digit hex color.` };
    }
    theme[key] = color.toUpperCase() as never;
  }
  for (const key of ["headingFont", "bodyFont", "monoFont"] as const) {
    const font = candidate[key];
    if (typeof font !== "string" || !(font in MARKET_PULSE_FONT_OPTIONS)) {
      return { ok: false, error: `${key} must be an available site font.` };
    }
    theme[key] = font as MarketPulseFontId;
  }
  return { ok: true, theme };
}

/** Rough relative luminance, enough to tell a dark card from a light one. */
function isDarkHex(hex: string): boolean {
  const v = hex.replace("#", "");
  if (v.length !== 6) return false;
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

export function marketPulseThemeCssVars(theme: MarketPulseTheme) {
  // Hairlines and empty bar tracks were black-tinted everywhere, which vanishes
  // the moment a theme puts a dark colour behind them. Deriving them from the
  // card means every preset — including ones saved in the admin — gets the
  // right tint without anyone restating it.
  const onDark = isDarkHex(theme.cardBackground);
  return {
    "--mp-hairline": onDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    "--mp-track": onDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
    "--mp-page-bg": theme.pageBackground,
    "--mp-card-bg": theme.cardBackground,
    "--mp-surface": theme.surface,
    "--mp-surface-deep": theme.surfaceDeep,
    "--mp-accent": theme.accent,
    "--mp-text": theme.text,
    "--mp-muted-text": theme.mutedText,
    "--mp-inventory-bar": theme.inventoryBar,
    "--mp-months-supply-bar": theme.monthsSupplyBar,
    /** Avg DOM — sage (distinct from inventory / MOS). */
    "--mp-avg-dom-bar": "#5B8A72",
    /** Closed sales — warm coral. */
    "--mp-closed-bar": "#C45C4A",
    "--mp-heading-font": MARKET_PULSE_FONT_OPTIONS[theme.headingFont].value,
    "--mp-body-font": MARKET_PULSE_FONT_OPTIONS[theme.bodyFont].value,
    "--mp-mono-font": MARKET_PULSE_FONT_OPTIONS[theme.monoFont].value,
  } as Record<`--${string}`, string>;
}
