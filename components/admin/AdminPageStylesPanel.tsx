"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cloneMarketPulseTheme,
  MARKET_PULSE_FONT_OPTIONS,
  MARKET_PULSE_THEME_PRESETS,
  marketPulseThemeCssVars,
  type MarketPulseFontId,
  type MarketPulseTheme,
} from "@/lib/page-theme-shared";

type Payload = {
  theme: MarketPulseTheme;
  default: MarketPulseTheme;
  isDefault: boolean;
  error?: string;
};

const COLOR_FIELDS: { key: keyof MarketPulseTheme; label: string }[] = [
  { key: "pageBackground", label: "Page background" },
  { key: "cardBackground", label: "Card background" },
  { key: "surface", label: "Navy surface" },
  { key: "surfaceDeep", label: "Deep surface" },
  { key: "accent", label: "Gold accent" },
  { key: "text", label: "Text" },
  { key: "mutedText", label: "Muted text" },
  { key: "inventoryBar", label: "Inventory bar" },
  { key: "monthsSupplyBar", label: "Months-supply bar" },
];

export default function AdminPageStylesPanel() {
  const [saved, setSaved] = useState<MarketPulseTheme | null>(null);
  const [draft, setDraft] = useState<MarketPulseTheme | null>(null);
  const [defaults, setDefaults] = useState<MarketPulseTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/page-theme", { cache: "no-store" })
      .then(async (res) => ({ res, body: (await res.json()) as Payload }))
      .then(({ res, body }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load page styles");
          return;
        }
        setSaved(cloneMarketPulseTheme(body.theme));
        setDraft(cloneMarketPulseTheme(body.theme));
        setDefaults(cloneMarketPulseTheme(body.default));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(
    () => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)),
    [draft, saved],
  );

  const cssVars = draft ? marketPulseThemeCssVars(draft) : undefined;

  function patch<K extends keyof MarketPulseTheme>(
    key: K,
    value: MarketPulseTheme[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/page-theme", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: draft }),
      });
      const body = (await res.json()) as Payload;
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      setSaved(cloneMarketPulseTheme(body.theme));
      setDraft(cloneMarketPulseTheme(body.theme));
      setMessage("Saved — Market Pulse now uses these page styles.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft) {
    return (
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-8 text-sm text-slate">
        Loading Market Pulse page styles…
      </div>
    );
  }

  return (
    <div
      id="admin-page-styles"
      className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Market Pulse
        </p>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Page-specific palette and typography. These controls affect only{" "}
          <span className="font-mono text-xs">/market-pulse</span>.
        </p>
      </div>

      <div className="space-y-8 px-5 py-6 sm:px-6">
        <section>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Presets
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(MARKET_PULSE_THEME_PRESETS).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDraft(cloneMarketPulseTheme(preset.theme))}
                className="rounded-full border border-navy/20 bg-cream/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-navy transition-colors hover:border-gold hover:bg-cream"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Palette
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-3 rounded-lg border border-charcoal/[0.1] p-3"
              >
                <input
                  type="color"
                  value={draft[key] as string}
                  onChange={(event) => patch(key, event.target.value.toUpperCase() as never)}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`${label} color`}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/55">
                    {label}
                  </span>
                  <span className="font-mono text-xs text-navy">{draft[key] as string}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Type
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["headingFont", "Heading"],
              ["bodyFont", "Body"],
              ["monoFont", "Mono"],
            ].map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/55">
                  {label}
                </span>
                <select
                  value={draft[key as keyof MarketPulseTheme] as string}
                  onChange={(event) =>
                    patch(key as keyof MarketPulseTheme, event.target.value as MarketPulseFontId)
                  }
                  className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
                >
                  {Object.entries(MARKET_PULSE_FONT_OPTIONS).map(([id, font]) => (
                    <option key={id} value={id}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Preview
          </p>
          <div
            style={cssVars}
            className="mt-3 rounded-xl bg-[var(--mp-page-bg)] p-4"
          >
            <div className="rounded-lg bg-[var(--mp-surface)] px-4 py-3">
              <p className="[font-family:var(--mp-mono-font)] text-[10px] tracking-[0.14em] uppercase text-[var(--mp-accent)]">
                TMRE Market Pulse
              </p>
              <p className="mt-1 [font-family:var(--mp-heading-font)] text-xl text-white">
                A clearer read on the market
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-b-lg bg-[var(--mp-card-bg)] p-4">
              <div>
                <p className="[font-family:var(--mp-mono-font)] text-[10px] uppercase text-[var(--mp-muted-text)]">
                  Inventory
                </p>
                <div className="mt-2 h-2 rounded bg-charcoal/10">
                  <div className="h-2 w-3/4 rounded bg-[var(--mp-inventory-bar)]" />
                </div>
              </div>
              <div>
                <p className="[font-family:var(--mp-mono-font)] text-[10px] uppercase text-[var(--mp-muted-text)]">
                  Months supply
                </p>
                <div className="mt-2 h-2 rounded bg-charcoal/10">
                  <div className="h-2 w-1/2 rounded bg-[var(--mp-months-supply-bar)]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-charcoal/[0.08] pt-5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="rounded-full border border-navy/30 bg-cream/40 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:bg-cream disabled:pointer-events-none disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save styles"}
          </button>
          <button
            type="button"
            onClick={() => defaults && setDraft(cloneMarketPulseTheme(defaults))}
            disabled={!defaults}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/50 underline underline-offset-4 hover:text-navy"
          >
            Reset to default
          </button>
          {message ? <p className="font-mono text-[10px] text-sage">{message}</p> : null}
          {error ? <p className="font-mono text-[10px] text-coral">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
