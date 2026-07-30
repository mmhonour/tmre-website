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
  pageBackground: "#EEF1F6",
  cardBackground: "#FFFFFF",
  surface: "#1B2A4A",
  surfaceDeep: "#131F38",
  accent: "#C8A951",
  text: "#1B2A4A",
  mutedText: "#5A5A56",
  inventoryBar: "#2A3D6B",
  monthsSupplyBar: "#C8A951",
  headingFont: "serif",
  bodyFont: "sans",
  monoFont: "mono",
};

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
};

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

export function marketPulseThemeCssVars(theme: MarketPulseTheme) {
  return {
    "--mp-page-bg": theme.pageBackground,
    "--mp-card-bg": theme.cardBackground,
    "--mp-surface": theme.surface,
    "--mp-surface-deep": theme.surfaceDeep,
    "--mp-accent": theme.accent,
    "--mp-text": theme.text,
    "--mp-muted-text": theme.mutedText,
    "--mp-inventory-bar": theme.inventoryBar,
    "--mp-months-supply-bar": theme.monthsSupplyBar,
    "--mp-heading-font": MARKET_PULSE_FONT_OPTIONS[theme.headingFont].value,
    "--mp-body-font": MARKET_PULSE_FONT_OPTIONS[theme.bodyFont].value,
    "--mp-mono-font": MARKET_PULSE_FONT_OPTIONS[theme.monoFont].value,
  } as Record<`--${string}`, string>;
}
