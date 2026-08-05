"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MORTGAGE_PAGE_CONTENT,
  MORTGAGE_NOTE_MAX,
  normalizeMortgagePageContent,
  type MortgagePageContent,
} from "@/lib/mortgage-page-shared";
import {
  FHFA_LOAN_LIMITS_URL,
  formatUsd,
  type ConformingCountyLimit,
} from "@/lib/mortgage-rates-shared";

type RatesStatus = {
  lastSyncedAt: string | null;
  lastResult: string | null;
  counts: { seriesId: string; rows: number; latestDate: string | null }[];
};

type Payload = {
  content: MortgagePageContent;
  fredConfigured?: boolean;
  rates?: RatesStatus;
  ok?: boolean;
  error?: string;
};

const labelClass =
  "font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50";
const inputClass =
  "w-full rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none";

function NoteField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <span className="text-xs text-charcoal/55">{hint}</span>
      <textarea
        value={value}
        rows={5}
        maxLength={MORTGAGE_NOTE_MAX}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} font-sans leading-relaxed`}
      />
      <span className="font-mono text-[10px] text-charcoal/35">
        {value.length}/{MORTGAGE_NOTE_MAX} · blank line starts a new paragraph
      </span>
    </label>
  );
}

/**
 * Admin content for /mortgage-rates: commentary blocks, an optional hand-entered
 * spot quote, the conforming loan-limit table, and a manual FRED refresh.
 */
export default function AdminMortgagePagePanel({
  initial,
}: {
  initial?: MortgagePageContent;
}) {
  const [content, setContent] = useState<MortgagePageContent>(
    () => initial ?? structuredClone(DEFAULT_MORTGAGE_PAGE_CONTENT),
  );
  const [baseline, setBaseline] = useState<MortgagePageContent>(
    () => initial ?? structuredClone(DEFAULT_MORTGAGE_PAGE_CONTENT),
  );
  const [fredConfigured, setFredConfigured] = useState<boolean | null>(null);
  const [rates, setRates] = useState<RatesStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/mortgage-page", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Payload | null) => {
        if (cancelled || !body?.content) return;
        setFredConfigured(Boolean(body.fredConfigured));
        setRates(body.rates ?? null);
        if (initial) return;
        const next = normalizeMortgagePageContent(body.content);
        setContent(next);
        setBaseline(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const dirty = JSON.stringify(content) !== JSON.stringify(baseline);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/mortgage-page", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await res.json()) as Payload;
      if (!res.ok || !body.content) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      const next = normalizeMortgagePageContent(body.content);
      setContent(next);
      setBaseline(next);
      setRates(body.rates ?? rates);
      setMessage("Saved — /mortgage-rates updates on next page load");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const refreshRates = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/mortgage-rates-sync", {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        series?: { seriesId: string; ok: boolean; rows: number; reason?: string }[];
        counts?: RatesStatus["counts"];
      };
      if (!res.ok || !body.ok) {
        const failed = (body.series ?? [])
          .filter((s) => !s.ok)
          .map((s) => `${s.seriesId} (${s.reason ?? "failed"})`)
          .join(", ");
        setMessage(body.error ?? `FRED refresh failed: ${failed || "unknown"}`);
      } else {
        const rows = (body.series ?? []).reduce((sum, s) => sum + s.rows, 0);
        setMessage(`FRED refresh ok — ${rows} observations upserted`);
      }
      const counts = body.counts;
      if (counts) {
        setRates((prev) => ({
          lastSyncedAt: prev?.lastSyncedAt ?? null,
          lastResult: prev?.lastResult ?? null,
          counts,
        }));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "FRED refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const patchSpot = (patch: Partial<MortgagePageContent["spotQuote"]>) => {
    setContent((prev) => ({ ...prev, spotQuote: { ...prev.spotQuote, ...patch } }));
  };

  const patchLimits = (
    patch: Partial<Omit<MortgagePageContent["loanLimits"], "counties">>,
  ) => {
    setContent((prev) => ({
      ...prev,
      loanLimits: { ...prev.loanLimits, ...patch },
    }));
  };

  const patchCounty = (
    index: number,
    patch: Partial<ConformingCountyLimit>,
  ) => {
    setContent((prev) => ({
      ...prev,
      loanLimits: {
        ...prev.loanLimits,
        counties: prev.loanLimits.counties.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      },
    }));
  };

  const addCounty = () => {
    setContent((prev) => ({
      ...prev,
      loanLimits: {
        ...prev.loanLimits,
        counties: [
          ...prev.loanLimits.counties,
          {
            id: `county-${prev.loanLimits.counties.length + 1}`,
            label: "",
            oneUnit: prev.loanLimits.baselineOneUnit,
            note: "",
          },
        ],
      },
    }));
  };

  const removeCounty = (index: number) => {
    setContent((prev) => ({
      ...prev,
      loanLimits: {
        ...prev.loanLimits,
        counties: prev.loanLimits.counties.filter((_, i) => i !== index),
      },
    }));
  };

  return (
    <div
      id="admin-mortgage-page"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Mortgage page
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Your commentary, an optional quoted rate, and the conforming loan
          limits shown on{" "}
          <a
            href="/mortgage-rates"
            className="underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
          >
            /mortgage-rates
          </a>
          . Rate history and the jumbo-vs-conforming chart come from FRED — this
          panel only overlays your words on top.
        </p>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-8">
        <section className="space-y-4">
          <h3 className={labelClass}>Commentary</h3>
          <NoteField
            label="Market note"
            hint="Sits under the rate cards — what rates are doing and what it means locally."
            value={content.marketNote}
            onChange={(marketNote) =>
              setContent((prev) => ({ ...prev, marketNote }))
            }
          />
          <NoteField
            label="Buyer strategies note"
            hint="Your take for buyers — moving up, buying before selling, rate buydowns."
            value={content.buyerNote}
            onChange={(buyerNote) =>
              setContent((prev) => ({ ...prev, buyerNote }))
            }
          />
          <NoteField
            label="Seller / downsizing note"
            hint="Your take for sellers and downsizers — timing, pricing, carrying two payments."
            value={content.sellerNote}
            onChange={(sellerNote) =>
              setContent((prev) => ({ ...prev, sellerNote }))
            }
          />
        </section>

        <section className="space-y-3">
          <h3 className={labelClass}>Spot quote (optional)</h3>
          <p className="text-xs text-charcoal/55 max-w-2xl">
            A hand-entered quote shown beside the survey averages. Leave off
            when you do not want a live-looking number on the page.
          </p>
          <label className="inline-flex items-center gap-2 font-mono text-[10px] text-charcoal/60">
            <input
              type="checkbox"
              checked={content.spotQuote.enabled}
              onChange={(e) => patchSpot({ enabled: e.target.checked })}
            />
            Show spot quote
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Label</span>
              <input
                type="text"
                value={content.spotQuote.label}
                maxLength={120}
                onChange={(e) => patchSpot({ label: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Rate</span>
              <input
                type="text"
                value={content.spotQuote.rate}
                placeholder="6.50% / 0 pts"
                maxLength={60}
                onChange={(e) => patchSpot({ rate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Terms</span>
              <input
                type="text"
                value={content.spotQuote.terms}
                placeholder="30-yr fixed jumbo, 25% down, 760+ FICO"
                maxLength={300}
                onChange={(e) => patchSpot({ terms: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>As of</span>
              <input
                type="text"
                value={content.spotQuote.asOf}
                placeholder="Aug 5, 9:00 a.m."
                maxLength={80}
                onChange={(e) => patchSpot({ asOf: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className={labelClass}>Conforming loan limits</h3>
          <p className="text-xs text-charcoal/55 max-w-2xl">
            Verify against the{" "}
            <a
              href={FHFA_LOAN_LIMITS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
            >
              official FHFA table
            </a>{" "}
            each year — county high-cost designations change.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Limit year</span>
              <input
                type="number"
                value={content.loanLimits.year}
                onChange={(e) => patchLimits({ year: Number(e.target.value) })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Baseline (1-unit)</span>
              <input
                type="number"
                value={content.loanLimits.baselineOneUnit}
                onChange={(e) =>
                  patchLimits({ baselineOneUnit: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>High-cost ceiling</span>
              <input
                type="number"
                value={content.loanLimits.highCostCeiling}
                onChange={(e) =>
                  patchLimits({ highCostCeiling: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
          </div>

          <div className="space-y-2">
            {content.loanLimits.counties.map((county, i) => (
              <div
                key={county.id}
                className="grid gap-2 rounded-lg border border-charcoal/[0.08] bg-cream/30 p-3 sm:grid-cols-[1.2fr_0.8fr_1.5fr_auto]"
              >
                <input
                  type="text"
                  value={county.label}
                  placeholder="Fairfield County, CT"
                  maxLength={120}
                  onChange={(e) => patchCounty(i, { label: e.target.value })}
                  className={inputClass}
                  aria-label="County label"
                />
                <input
                  type="number"
                  value={county.oneUnit}
                  onChange={(e) =>
                    patchCounty(i, { oneUnit: Number(e.target.value) })
                  }
                  className={inputClass}
                  aria-label="One-unit limit"
                />
                <input
                  type="text"
                  value={county.note}
                  placeholder="Note shown under the figure"
                  maxLength={300}
                  onChange={(e) => patchCounty(i, { note: e.target.value })}
                  className={inputClass}
                  aria-label="County note"
                />
                <button
                  type="button"
                  onClick={() => removeCounty(i)}
                  className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-2 border border-coral/30 text-coral hover:bg-coral/[0.08] transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addCounty}
              className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-charcoal/20 text-charcoal/70 hover:bg-cream/50 transition-colors"
            >
              Add county
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className={labelClass}>FRED rate data</h3>
          {fredConfigured === false ? (
            <p className="text-xs text-coral">
              FRED_API_KEY is not set — the page renders your commentary and the
              limits table, but rate cards and the chart stay empty until the key
              is added.
            </p>
          ) : null}
          {rates?.lastSyncedAt ? (
            <p className="font-mono text-[10px] text-charcoal/45">
              last synced {new Date(rates.lastSyncedAt).toLocaleString()}
              {rates.lastResult ? ` · ${rates.lastResult}` : ""}
            </p>
          ) : (
            <p className="font-mono text-[10px] text-charcoal/45">
              never synced
            </p>
          )}
          {rates?.counts?.length ? (
            <ul className="font-mono text-[10px] text-charcoal/45 space-y-0.5">
              {rates.counts.map((row) => (
                <li key={row.seriesId}>
                  {row.seriesId} — {row.rows.toLocaleString()} rows · latest{" "}
                  {row.latestDate ?? "—"}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshRates()}
            disabled={refreshing || fredConfigured === false}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {refreshing ? "Refreshing…" : "Refresh rates from FRED"}
          </button>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-charcoal/[0.08] pt-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save page content"}
          </button>
          {content.updatedAt ? (
            <p className="font-mono text-[10px] text-charcoal/45">
              commentary updated{" "}
              {new Date(content.updatedAt).toLocaleString()} · baseline{" "}
              {formatUsd(content.loanLimits.baselineOneUnit)}
            </p>
          ) : null}
          {message ? (
            <p className="font-mono text-[11px] text-charcoal/55">{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
