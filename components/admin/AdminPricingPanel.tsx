"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COMPARABLES_LOOKBACK_OPTIONS,
  lookbackLabel,
} from "@/lib/listing-comparables-shared";
import {
  clonePricingMatchingConfig,
  DEFAULT_PRICING_MATCHING_CONFIG,
  type PricingMatchingConfig,
} from "@/lib/pricing-matching-config-shared";

type ApiPayload = {
  config: PricingMatchingConfig;
  default: PricingMatchingConfig;
  isDefault: boolean;
  meta?: {
    lookbackOptions?: number[];
  };
};

function pctDisplay(fraction: number): string {
  return String(Math.round(fraction * 1000) / 10);
}

type Draft = {
  bedTolerance: string;
  bathTolerance: string;
  sqftTolerancePct: string;
  vintageEdgePct: string;
  defaultLookbackMonths: number;
};

function configToDraft(config: PricingMatchingConfig): Draft {
  return {
    bedTolerance: String(config.bedTolerance),
    bathTolerance: String(config.bathTolerance),
    sqftTolerancePct: pctDisplay(config.sqftTolerance),
    vintageEdgePct: pctDisplay(config.vintageEdgeFraction),
    defaultLookbackMonths: config.defaultLookbackMonths,
  };
}

function draftToConfig(draft: Draft): PricingMatchingConfig {
  return {
    bedTolerance: Number(draft.bedTolerance),
    bathTolerance: Number(draft.bathTolerance),
    sqftTolerance: Number(draft.sqftTolerancePct) / 100,
    vintageEdgeFraction: Number(draft.vintageEdgePct) / 100,
    defaultLookbackMonths: draft.defaultLookbackMonths as PricingMatchingConfig["defaultLookbackMonths"],
  };
}

/**
 * Admin control for Sales / Rentals / What if match parameters. Stored in
 * sync_meta so changes apply without a redeploy; comparable edge caches and
 * What if detail caches invalidate via the config fingerprint.
 */
export default function AdminPricingPanel({
  initial,
}: {
  initial?: ApiPayload;
}) {
  const [saved, setSaved] = useState<PricingMatchingConfig | null>(
    initial?.config ?? null,
  );
  const [draft, setDraft] = useState<Draft | null>(
    initial ? configToDraft(initial.config) : null,
  );
  const [defaults] = useState<PricingMatchingConfig>(
    initial?.default ?? clonePricingMatchingConfig(),
  );
  const lookbackOptions =
    initial?.meta?.lookbackOptions ?? [...COMPARABLES_LOOKBACK_OPTIONS];
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/pricing-matching-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: ApiPayload | null) => {
        if (cancelled || !body?.config) return;
        setSaved(body.config);
        setDraft(configToDraft(body.config));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return JSON.stringify(configToDraft(saved)) !== JSON.stringify(draft);
  }, [saved, draft]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/pricing-matching-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: draftToConfig(draft) }),
      });
      const body = (await res.json()) as ApiPayload & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setSaved(body.config);
      setDraft(configToDraft(body.config));
      setMessage("Saved — Sales, Rentals, and What if will use these match rules.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setDraft(configToDraft(defaults));
    setMessage(null);
  };

  if (!draft) {
    return (
      <div
        id="admin-pricing"
        className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-6 text-sm text-slate">
          Loading pricing parameters…
        </div>
      </div>
    );
  }

  return (
    <div
      id="admin-pricing"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Pricing match parameters
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          Shared rules for Sales comparables, Comparable Rentals, UAG, and What
          if. Changing these does not require a redeploy — saved values live in
          sync_meta and invalidate stale comparable / What if caches.
        </p>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Bed tolerance (±)
            </span>
            <input
              type="number"
              min={0}
              max={5}
              step={1}
              value={draft.bedTolerance}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, bedTolerance: e.target.value } : d))
              }
              className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal"
            />
            <span className="text-xs text-charcoal/45">
              Adjacent bedroom counts allowed.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Bath tolerance (±)
            </span>
            <input
              type="number"
              min={0}
              max={5}
              step={1}
              value={draft.bathTolerance}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, bathTolerance: e.target.value } : d,
                )
              }
              className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal"
            />
            <span className="text-xs text-charcoal/45">
              Adjacent bathroom counts allowed.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Living area band (±%)
            </span>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={draft.sqftTolerancePct}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, sqftTolerancePct: e.target.value } : d,
                )
              }
              className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal"
            />
            <span className="text-xs text-charcoal/45">
              Default {pctDisplay(DEFAULT_PRICING_MATCHING_CONFIG.sqftTolerance)}%.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Vintage edge (%)
            </span>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={draft.vintageEdgePct}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, vintageEdgePct: e.target.value } : d,
                )
              }
              className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal"
            />
            <span className="text-xs text-charcoal/45">
              Share of a vintage bucket span that also matches the bordering era.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Default look-back
            </span>
            <select
              value={draft.defaultLookbackMonths}
              onChange={(e) =>
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        defaultLookbackMonths: Number(e.target.value),
                      }
                    : d,
                )
              }
              className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal"
            >
              {lookbackOptions.map((months) => (
                <option key={months} value={months}>
                  {lookbackLabel(months)} ({months} mo)
                </option>
              ))}
            </select>
            <span className="text-xs text-charcoal/45">
              Used by Sales, Rentals, and What if when no wider window is chosen.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="rounded-lg bg-navy px-4 py-2 font-mono text-[11px] tracking-[0.14em] uppercase text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save parameters"}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            disabled={saving}
            className="rounded-lg border border-charcoal/15 px-4 py-2 font-mono text-[11px] tracking-[0.14em] uppercase text-charcoal/70 hover:border-charcoal/30"
          >
            Reset to defaults
          </button>
          {message ? (
            <p className="text-sm text-slate">{message}</p>
          ) : dirty ? (
            <p className="text-sm text-charcoal/45">Unsaved changes</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
