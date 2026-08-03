"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cloneIntelligenceDescriptorSizes,
  DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
  INTEL_DESCRIPTOR_SIZE_MAX_PX,
  INTEL_DESCRIPTOR_SIZE_MIN_PX,
  type IntelligenceDescriptorSizes,
} from "@/lib/intelligence-descriptor-sizes-shared";

type ApiPayload = {
  config: IntelligenceDescriptorSizes;
  default: IntelligenceDescriptorSizes;
  isDefault: boolean;
  note?: string;
  error?: string;
};

const PREVIEW_PARTS = [
  "Westport",
  "Rentals",
  "2-10K",
  "3 Beds",
  "2 Baths",
] as const;

function DescriptorPreview({
  label,
  widthClass,
  fontPx,
}: {
  label: string;
  widthClass: string;
  fontPx: number;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
        {label} · {fontPx}px
      </p>
      <div
        className={`${widthClass} overflow-hidden rounded-xl border border-navy/20 bg-[#1B2A4A] px-3 py-3 shadow-sm`}
      >
        <p
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-mono tracking-wide text-white/45"
          style={{ fontSize: `${fontPx}px` }}
        >
          {PREVIEW_PARTS.map((part, i) => (
            <span key={part} className="contents">
              {i > 0 ? (
                <span className="text-gold/65 font-bold" aria-hidden>
                  •
                </span>
              ) : null}
              <span
                className={
                  i >= 2
                    ? "text-gold tabular-nums shrink-0"
                    : "text-white/45 shrink-0"
                }
              >
                {part}
              </span>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/**
 * Admin → Data controls → Filter text: mobile/desktop idle sizes for
 * Intelligence filter descriptors, with live preview.
 */
export default function AdminIntelligenceDescriptorSizesPanel() {
  const [saved, setSaved] = useState<IntelligenceDescriptorSizes | null>(null);
  const [draft, setDraft] = useState<IntelligenceDescriptorSizes | null>(null);
  const [defaults, setDefaults] = useState<IntelligenceDescriptorSizes | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyPayload = useCallback((body: ApiPayload) => {
    setSaved(cloneIntelligenceDescriptorSizes(body.config));
    setDraft(cloneIntelligenceDescriptorSizes(body.config));
    setDefaults(cloneIntelligenceDescriptorSizes(body.default));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/intelligence-descriptor-sizes", {
        cache: "no-store",
      });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok) {
        setError(body.error ?? "Failed to load descriptor sizes");
        return;
      }
      applyPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(draft) !== JSON.stringify(saved);
  }, [draft, saved]);

  const draftIsDefault = useMemo(() => {
    if (!draft || !defaults) return true;
    return JSON.stringify(draft) === JSON.stringify(defaults);
  }, [draft, defaults]);

  function patch(key: keyof IntelligenceDescriptorSizes, value: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: Math.min(
              INTEL_DESCRIPTOR_SIZE_MAX_PX,
              Math.max(INTEL_DESCRIPTOR_SIZE_MIN_PX, Math.round(value)),
            ),
          }
        : current,
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/intelligence-descriptor-sizes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      applyPayload(body);
      setNotice(body.note ?? "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    if (!defaults) return;
    setDraft(cloneIntelligenceDescriptorSizes(defaults));
  }

  return (
    <div id="admin-intel-descriptor-sizes" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Intelligence · filter descriptors
          </p>
          <p className="mt-1 max-w-3xl text-sm text-charcoal/65">
            Idle size for filter descriptor text on the Intelligence page
            (town, sale/rentals, price, beds, baths, …). Mobile and desktop are
            independent. Held/active enlarge still uses the larger emphasis
            size.
          </p>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {loading ? (
            <p className="font-mono text-[12px] text-charcoal/50">Loading…</p>
          ) : null}
          {error ? (
            <p className="font-mono text-[12px] text-coral">{error}</p>
          ) : null}
          {notice ? (
            <p className="font-mono text-[12px] text-sage">{notice}</p>
          ) : null}

          {draft ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3">
                  <span className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
                    Mobile
                    <span className="tabular-nums text-navy">
                      {draft.mobilePx}px
                    </span>
                  </span>
                  <input
                    type="range"
                    min={INTEL_DESCRIPTOR_SIZE_MIN_PX}
                    max={INTEL_DESCRIPTOR_SIZE_MAX_PX}
                    step={1}
                    value={draft.mobilePx}
                    onChange={(e) =>
                      patch("mobilePx", Number(e.target.value))
                    }
                    className="w-full accent-gold"
                  />
                  <span className="block font-mono text-[10px] text-charcoal/40">
                    Below lg breakpoint (&lt;1024px)
                  </span>
                </label>

                <label className="block space-y-2 rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3">
                  <span className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
                    Desktop
                    <span className="tabular-nums text-navy">
                      {draft.desktopPx}px
                    </span>
                  </span>
                  <input
                    type="range"
                    min={INTEL_DESCRIPTOR_SIZE_MIN_PX}
                    max={INTEL_DESCRIPTOR_SIZE_MAX_PX}
                    step={1}
                    value={draft.desktopPx}
                    onChange={(e) =>
                      patch("desktopPx", Number(e.target.value))
                    }
                    className="w-full accent-gold"
                  />
                  <span className="block font-mono text-[10px] text-charcoal/40">
                    lg and up (≥1024px)
                  </span>
                </label>
              </div>

              <div>
                <p className="mb-3 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
                  Preview
                </p>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <DescriptorPreview
                    label="Mobile"
                    widthClass="w-full max-w-[320px]"
                    fontPx={draft.mobilePx}
                  />
                  <DescriptorPreview
                    label="Desktop"
                    widthClass="w-full max-w-none"
                    fontPx={draft.desktopPx}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-charcoal/[0.08] pt-4">
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-navy px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-white disabled:opacity-40 hover:bg-navy/90 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() =>
                    saved && setDraft(cloneIntelligenceDescriptorSizes(saved))
                  }
                  className="rounded-lg border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy disabled:opacity-40 hover:border-gold/50 hover:text-gold transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={saving || draftIsDefault}
                  onClick={resetDraft}
                  className="rounded-lg border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy disabled:opacity-40 hover:border-gold/50 hover:text-gold transition-colors"
                >
                  Reset to {DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES.mobilePx}px
                </button>
                {dirty ? (
                  <span className="font-mono text-[10px] text-charcoal/45">
                    Unsaved changes
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
