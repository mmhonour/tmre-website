"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cloneGoldilocksConfig,
  GOLDILOCKS_FACTOR_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_ORDER,
  goldilocksWeightSum,
  type GoldilocksKeywordGroupId,
  type GoldilocksScoringConfig,
} from "@/lib/goldilocks-config-shared";
import type { GoldilocksFactorKey } from "@/lib/goldilocks-score-info";
import { FACTOR_LABELS } from "@/lib/goldilocks-score-info";
import {
  ADMIN_SYNC_ACTIONS,
  type AdminSyncActionId,
} from "@/lib/admin-sync-types";

type FactorMeta = {
  key: GoldilocksFactorKey;
  label: string;
  description: string;
};

type KeywordGroupMeta = {
  id: GoldilocksKeywordGroupId;
  label: string;
  hint: string;
};

type ApiPayload = {
  config: GoldilocksScoringConfig;
  default: GoldilocksScoringConfig;
  isDefault: boolean;
  weightSum: number;
  meta: {
    factors: FactorMeta[];
    keywordGroups: KeywordGroupMeta[];
  };
};

function keywordsToText(list: string[]): string {
  return list.join("\n");
}

function textToKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function pctInputValue(weight: number): string {
  return String(Math.round(weight * 1000) / 10);
}

export default function AdminGoldilocksPanel({
  initial,
}: {
  initial?: ApiPayload;
}) {
  const [saved, setSaved] = useState<GoldilocksScoringConfig | null>(
    initial?.config ?? null,
  );
  const [draft, setDraft] = useState<GoldilocksScoringConfig | null>(
    initial ? cloneGoldilocksConfig(initial.config) : null,
  );
  const [defaults] = useState<GoldilocksScoringConfig>(
    initial?.default ?? cloneGoldilocksConfig(),
  );
  const [factors, setFactors] = useState<FactorMeta[]>(
    initial?.meta.factors ??
      GOLDILOCKS_FACTOR_ORDER.map((key) => ({
        key,
        label: FACTOR_LABELS[key],
        description: "",
      })),
  );
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroupMeta[]>(
    initial?.meta.keywordGroups ??
      GOLDILOCKS_KEYWORD_GROUP_ORDER.map((id) => ({
        id,
        label: id,
        hint: "",
      })),
  );
  const [keywordText, setKeywordText] = useState<
    Record<GoldilocksKeywordGroupId, string>
  >(() => {
    const cfg = initial?.config ?? cloneGoldilocksConfig();
    const out = {} as Record<GoldilocksKeywordGroupId, string>;
    for (const id of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      out[id] = keywordsToText(cfg.keywords[id]);
    }
    return out;
  });
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((body: ApiPayload) => {
    setSaved(body.config);
    setDraft(cloneGoldilocksConfig(body.config));
    setFactors(body.meta.factors);
    setKeywordGroups(body.meta.keywordGroups);
    const texts = {} as Record<GoldilocksKeywordGroupId, string>;
    for (const id of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      texts[id] = keywordsToText(body.config.keywords[id]);
    }
    setKeywordText(texts);
  }, []);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/goldilocks-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: ApiPayload | null) => {
        if (cancelled || !body) return;
        applyPayload(body);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Goldilocks config");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, applyPayload]);

  const weightSum = useMemo(
    () => (draft ? goldilocksWeightSum(draft.weights) : 0),
    [draft],
  );
  const weightSumPct = Math.round(weightSum * 1000) / 10;
  const weightsValid = Math.abs(weightSum - 1) <= 0.001;

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    const nextKeywords = {} as GoldilocksScoringConfig["keywords"];
    for (const id of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      nextKeywords[id] = textToKeywords(keywordText[id] ?? "");
    }
    return (
      JSON.stringify({ ...draft, keywords: nextKeywords }) !==
      JSON.stringify(saved)
    );
  }, [draft, saved, keywordText]);

  function setWeightPct(key: GoldilocksFactorKey, pctStr: string) {
    const pct = Number(pctStr);
    if (!Number.isFinite(pct)) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        weights: {
          ...prev.weights,
          [key]: Math.max(0, Math.min(100, pct)) / 100,
        },
      };
    });
  }

  async function save() {
    if (!draft) return;
    if (!weightsValid) {
      setError("Weights must sum to 100% before saving");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const config: GoldilocksScoringConfig = {
      weights: { ...draft.weights },
      keywords: {
        reno: textToKeywords(keywordText.reno),
        quality: textToKeywords(keywordText.quality),
        lowQuality: textToKeywords(keywordText.lowQuality),
        conditionDowngrade: textToKeywords(keywordText.conditionDowngrade),
        goodLayout: textToKeywords(keywordText.goodLayout),
        badLayout: textToKeywords(keywordText.badLayout),
        disqualifying: textToKeywords(keywordText.disqualifying),
      },
    };
    try {
      const res = await fetch("/api/admin/goldilocks-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const body = (await res.json()) as ApiPayload & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      applyPayload(body);
      setMessage(
        "Saved to Postgres. Run Goldilocks score rebuild to refresh stored listing scores.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    const next = cloneGoldilocksConfig(defaults);
    setDraft(next);
    const texts = {} as Record<GoldilocksKeywordGroupId, string>;
    for (const id of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      texts[id] = keywordsToText(next.keywords[id]);
    }
    setKeywordText(texts);
    setMessage(null);
    setError(null);
  }

  async function rebuildScores() {
    setRebuilding(true);
    setError(null);
    setMessage(null);
    const action: AdminSyncActionId = "listing-scores";
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: string;
      };
      if (!res.ok || body.ok === false) {
        setError(
          body.error ||
            body.status ||
            `${ADMIN_SYNC_ACTIONS[action].label} failed (HTTP ${res.status})`,
        );
        return;
      }
      setMessage(
        `${ADMIN_SYNC_ACTIONS[action].label} finished — stored listing scores now use the saved weights & characteristics.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  }

  if (loading || !draft) {
    return (
      <div
        id="admin-goldilocks"
        className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-6 shadow-sm sm:px-6"
      >
        <p className="font-mono text-xs text-charcoal/50">
          Loading Goldilocks scoring config…
        </p>
      </div>
    );
  }

  return (
    <div id="admin-goldilocks" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                Goldilocks scoring
              </p>
              <p className="mt-1 max-w-2xl text-sm text-charcoal/65">
                Composite % weights and remark characteristics used by
                Intelligence, Deal of the Day, and listing score badges. Values
                persist in Postgres. Stored listing scores update only when you
                run a Goldilocks score rebuild.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void rebuildScores()}
              disabled={rebuilding || dirty}
              title={
                dirty
                  ? "Save weight/characteristic changes before rebuilding"
                  : undefined
              }
              className="shrink-0 rounded-full border border-navy/30 bg-navy px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-white transition-colors hover:bg-navy/90 disabled:pointer-events-none disabled:opacity-40"
            >
              {rebuilding
                ? "Rebuilding scores…"
                : ADMIN_SYNC_ACTIONS["listing-scores"].label}
            </button>
          </div>
          {dirty ? (
            <p className="mt-2 font-mono text-[10px] text-coral">
              Unsaved edits — save first, then rebuild.
            </p>
          ) : null}
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-navy">
              Factor weights
            </p>
            <p
              className={`font-mono text-[11px] ${
                weightsValid ? "text-sage" : "text-coral"
              }`}
            >
              Sum {weightSumPct}%{weightsValid ? "" : " — must be 100%"}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className="border-b border-charcoal/[0.08] bg-cream/30 font-mono text-[10px] uppercase tracking-[0.14em] text-charcoal/50">
                  <th className="px-4 py-3 font-medium">Factor</th>
                  <th className="px-4 py-3 font-medium w-28">Weight %</th>
                  <th className="px-4 py-3 font-medium">What it measures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.06]">
                {factors.map((factor) => (
                  <tr key={factor.key}>
                    <td className="px-4 py-3 text-sm font-medium text-charcoal">
                      {factor.label}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={pctInputValue(draft.weights[factor.key])}
                        onChange={(e) =>
                          setWeightPct(factor.key, e.target.value)
                        }
                        className="w-24 rounded-lg border border-charcoal/15 px-2.5 py-1.5 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs leading-snug text-charcoal/60">
                      {factor.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Property characteristics
          </p>
          <p className="mt-1 max-w-2xl text-sm text-charcoal/65">
            Remark phrases the scorer matches (case-insensitive). One phrase per
            line. These drive condition, finishes, layout, and board
            disqualification.
          </p>
        </div>
        <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-2">
          {keywordGroups.map((group) => (
            <label
              key={group.id}
              className="flex flex-col gap-1.5 rounded-xl border border-charcoal/[0.08] px-4 py-3"
            >
              <span className="text-sm font-medium text-charcoal">
                {group.label}
              </span>
              <span className="text-xs text-charcoal/55">{group.hint}</span>
              <textarea
                rows={Math.min(
                  10,
                  Math.max(4, (keywordText[group.id] ?? "").split("\n").length + 1),
                )}
                value={keywordText[group.id] ?? ""}
                onChange={(e) =>
                  setKeywordText((prev) => ({
                    ...prev,
                    [group.id]: e.target.value,
                  }))
                }
                className="mt-1 w-full resize-y rounded-lg border border-charcoal/15 px-2.5 py-2 font-mono text-xs leading-relaxed text-navy focus:border-navy focus:outline-none"
                spellCheck={false}
              />
              <span className="font-mono text-[10px] text-charcoal/40">
                {textToKeywords(keywordText[group.id] ?? "").length} phrases
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty || !weightsValid}
          className="rounded-full border border-navy/30 bg-cream/40 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:bg-cream disabled:pointer-events-none disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save to Postgres"}
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          className="rounded-full border border-charcoal/15 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 transition-colors hover:border-charcoal/30 hover:text-navy"
        >
          Reset draft to defaults
        </button>
        <button
          type="button"
          onClick={() => void rebuildScores()}
          disabled={rebuilding || dirty}
          className="rounded-full border border-navy/30 bg-navy px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-white transition-colors hover:bg-navy/90 disabled:pointer-events-none disabled:opacity-40"
        >
          {rebuilding
            ? "Rebuilding scores…"
            : ADMIN_SYNC_ACTIONS["listing-scores"].label}
        </button>
        {message ? (
          <p className="font-mono text-[10px] text-sage">{message}</p>
        ) : null}
        {error ? (
          <p className="font-mono text-[10px] text-coral">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
