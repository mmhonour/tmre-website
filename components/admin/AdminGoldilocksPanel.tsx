"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cloneGoldilocksConfig,
  GOLDILOCKS_FACTOR_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_ORDER,
  goldilocksWeightSum,
  type GoldilocksDomDayRange,
  type GoldilocksDomTier,
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
  /** Saved config differs from the last Goldilocks score rebuild. */
  needsRebuild: boolean;
  meta: {
    factors: FactorMeta[];
    keywordGroups: KeywordGroupMeta[];
  };
};

/** Trim, lowercase, drop blanks/dupes — used when comparing/saving phrases. */
function normalizeKeywordList(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function keywordListsFromConfig(
  keywords: GoldilocksScoringConfig["keywords"],
): Record<GoldilocksKeywordGroupId, string[]> {
  const out = {} as Record<GoldilocksKeywordGroupId, string[]>;
  for (const id of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
    out[id] = [...(keywords[id] ?? [])];
  }
  return out;
}

function pctInputValue(weight: number): string {
  return String(Math.round(weight * 1000) / 10);
}

function formatDomDayRange(range: GoldilocksDomDayRange): string {
  if (range.maxDays == null) {
    return `${range.minDays}+`;
  }
  if (range.minDays === range.maxDays) {
    return String(range.minDays);
  }
  return `${range.minDays}–${range.maxDays}`;
}

function formatDomRangesLabel(tier: GoldilocksDomTier): string {
  if (tier.ranges.length === 0) return "—";
  return tier.ranges.map(formatDomDayRange).join(", ");
}

type GoldilocksSubPanelId = "weights" | "dom" | "characteristics";

const GOLDILOCKS_SUB_PANELS: {
  id: GoldilocksSubPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "weights",
    label: "Factor weights",
    subtitle: "Composite % weights for age, condition, finishes, PPSF, layout, schools, and DOM",
  },
  {
    id: "dom",
    label: "DOM bands",
    subtitle: "Days-on-market score tiers — first matching range wins",
  },
  {
    id: "characteristics",
    label: "Characteristics",
    subtitle: "Remark phrases that drive condition, finishes, layout, and disqualification",
  },
];

function goldilocksSubFromLocation(): GoldilocksSubPanelId {
  if (typeof window === "undefined") return "weights";
  const sub = new URLSearchParams(window.location.search).get("sub");
  if (sub === "dom" || sub === "characteristics" || sub === "weights") {
    return sub;
  }
  return "weights";
}

export default function AdminGoldilocksPanel({
  initial,
}: {
  initial?: ApiPayload;
}) {
  const [subPanel, setSubPanel] =
    useState<GoldilocksSubPanelId>("weights");
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
  const [keywordLists, setKeywordLists] = useState<
    Record<GoldilocksKeywordGroupId, string[]>
  >(() =>
    keywordListsFromConfig(
      (initial?.config ?? cloneGoldilocksConfig()).keywords,
    ),
  );
  const [needsRebuild, setNeedsRebuild] = useState(
    initial?.needsRebuild ?? false,
  );
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSubPanel(goldilocksSubFromLocation());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function selectSubPanel(next: GoldilocksSubPanelId) {
    setSubPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "data-controls");
    url.searchParams.set("panel", "goldilocks");
    url.searchParams.set("sub", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const applyPayload = useCallback((body: ApiPayload) => {
    setSaved(body.config);
    setDraft(cloneGoldilocksConfig(body.config));
    setFactors(body.meta.factors);
    setKeywordGroups(body.meta.keywordGroups);
    setKeywordLists(keywordListsFromConfig(body.config.keywords));
    setNeedsRebuild(Boolean(body.needsRebuild));
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
      nextKeywords[id] = normalizeKeywordList(keywordLists[id] ?? []);
    }
    return (
      JSON.stringify({ ...draft, keywords: nextKeywords }) !==
      JSON.stringify(saved)
    );
  }, [draft, saved, keywordLists]);

  /** Live read-only DOM band overview — tracks draft edits before save. */
  const domBandSummary = useMemo(() => {
    if (!draft) return null;
    return {
      tiers: draft.domTiers.map((tier) => ({
        id: tier.id,
        label: tier.label.trim() || "(unnamed)",
        score: tier.score,
        ranges: formatDomRangesLabel(tier),
      })),
      missingScore: draft.domMissingScore,
    };
  }, [draft]);

  function updateKeywordPhrase(
    groupId: GoldilocksKeywordGroupId,
    index: number,
    value: string,
  ) {
    setKeywordLists((prev) => {
      const list = [...(prev[groupId] ?? [])];
      list[index] = value;
      return { ...prev, [groupId]: list };
    });
  }

  function addKeywordPhrase(groupId: GoldilocksKeywordGroupId) {
    setKeywordLists((prev) => ({
      ...prev,
      [groupId]: [...(prev[groupId] ?? []), ""],
    }));
  }

  function removeKeywordPhrase(
    groupId: GoldilocksKeywordGroupId,
    index: number,
  ) {
    setKeywordLists((prev) => {
      const list = [...(prev[groupId] ?? [])];
      list.splice(index, 1);
      return { ...prev, [groupId]: list };
    });
  }

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
    const keywords = {} as GoldilocksScoringConfig["keywords"];
    for (const id of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      keywords[id] = normalizeKeywordList(keywordLists[id] ?? []);
    }
    const config: GoldilocksScoringConfig = {
      weights: { ...draft.weights },
      keywords,
      domTiers: draft.domTiers.map((tier) => ({
        ...tier,
        ranges: tier.ranges.map((r) => ({ ...r })),
      })),
      domMissingScore: draft.domMissingScore,
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
    setKeywordLists(keywordListsFromConfig(next.keywords));
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
      setNeedsRebuild(false);
      setMessage(
        `${ADMIN_SYNC_ACTIONS[action].label} finished — stored listing scores now use the saved weights & characteristics.`,
      );
      // Refresh needsRebuild from Postgres in case another writer changed config.
      try {
        const statusRes = await fetch("/api/admin/goldilocks-config", {
          cache: "no-store",
        });
        if (statusRes.ok) {
          const status = (await statusRes.json()) as ApiPayload;
          setNeedsRebuild(Boolean(status.needsRebuild));
        }
      } catch {
        // keep local false from successful rebuild
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  }

  const canRebuild = !dirty && needsRebuild && weightsValid;
  const rebuildDisabledReason = dirty
    ? "Save weight/characteristic changes before rebuilding"
    : !needsRebuild
      ? "Scores already match the saved config — change characteristics (or weights/DOM) and save first"
      : !weightsValid
        ? "Weights must sum to 100% before rebuilding"
        : undefined;

  function replaceDomTiers(next: GoldilocksDomTier[]) {
    setDraft((prev) => (prev ? { ...prev, domTiers: next } : prev));
  }

  function updateDomTier(
    tierIndex: number,
    patch: Partial<GoldilocksDomTier>,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const domTiers = prev.domTiers.map((tier, i) =>
        i === tierIndex ? { ...tier, ...patch } : tier,
      );
      return { ...prev, domTiers };
    });
  }

  function updateDomRange(
    tierIndex: number,
    rangeIndex: number,
    patch: Partial<GoldilocksDomDayRange>,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const domTiers = prev.domTiers.map((tier, i) => {
        if (i !== tierIndex) return tier;
        const ranges = tier.ranges.map((range, ri) =>
          ri === rangeIndex ? { ...range, ...patch } : range,
        );
        return { ...tier, ranges };
      });
      return { ...prev, domTiers };
    });
  }

  function addDomRange(tierIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const domTiers = prev.domTiers.map((tier, i) => {
        if (i !== tierIndex) return tier;
        return {
          ...tier,
          ranges: [...tier.ranges, { minDays: 0, maxDays: 30 }],
        };
      });
      return { ...prev, domTiers };
    });
  }

  function removeDomRange(tierIndex: number, rangeIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const domTiers = prev.domTiers.map((tier, i) => {
        if (i !== tierIndex) return tier;
        if (tier.ranges.length <= 1) return tier;
        return {
          ...tier,
          ranges: tier.ranges.filter((_, ri) => ri !== rangeIndex),
        };
      });
      return { ...prev, domTiers };
    });
  }

  function addDomTier() {
    replaceDomTiers([
      ...draft!.domTiers,
      {
        id: `tier-${Date.now()}`,
        label: "New tier",
        score: 50,
        ranges: [{ minDays: 0, maxDays: 30 }],
      },
    ]);
  }

  function removeDomTier(tierIndex: number) {
    if (draft!.domTiers.length <= 1) return;
    replaceDomTiers(draft!.domTiers.filter((_, i) => i !== tierIndex));
  }

  const activeSub =
    GOLDILOCKS_SUB_PANELS.find((item) => item.id === subPanel) ??
    GOLDILOCKS_SUB_PANELS[0]!;

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

  const actionsBar = (
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
        disabled={rebuilding || !canRebuild}
        title={rebuildDisabledReason}
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
  );

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
                Composite scoring used by Intelligence, Deal of the Day, and
                listing score badges. Values persist in Postgres; stored scores
                update only after a Goldilocks score rebuild.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void rebuildScores()}
              disabled={rebuilding || !canRebuild}
              title={rebuildDisabledReason}
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
          ) : needsRebuild ? (
            <p className="mt-2 font-mono text-[10px] text-coral">
              Saved scoring config changed — run a Goldilocks score rebuild to
              refresh stored listing scores.
            </p>
          ) : (
            <p className="mt-2 font-mono text-[10px] text-charcoal/45">
              Stored scores match the saved config. Change a sub-tab, save, then
              rebuild.
            </p>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Goldilocks"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {GOLDILOCKS_SUB_PANELS.map((item) => {
          const isActive = subPanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectSubPanel(item.id)}
              className={`shrink-0 -mb-px border-b-2 px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap transition-colors ${
                isActive
                  ? "border-gold text-navy"
                  : "border-transparent text-charcoal/50 hover:border-charcoal/15 hover:text-navy"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="-mt-3 text-xs leading-snug text-charcoal/55">
        {activeSub.subtitle}
      </p>

      <div
        role="tabpanel"
        hidden={subPanel !== "weights"}
        className={
          subPanel === "weights"
            ? "overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
            : undefined
        }
      >
        {subPanel === "weights" ? (
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
        ) : null}
      </div>

      <div
        role="tabpanel"
        hidden={subPanel !== "dom"}
        className={
          subPanel === "dom"
            ? "overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
            : undefined
        }
      >
        {subPanel === "dom" ? (
          <div className="space-y-4 px-5 py-5 sm:px-6">
            {domBandSummary ? (
              <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 px-4 py-3 sm:px-5">
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
                  Current bands · read-only
                </p>
                <div
                  className="mt-3 overflow-hidden rounded-lg border border-charcoal/[0.08] bg-white/70"
                  role="table"
                  aria-label="DOM band summary"
                >
                  <div
                    className="grid grid-cols-[minmax(0,1.2fr)_4.5rem_minmax(0,1.5fr)] gap-x-4 border-b border-charcoal/[0.1] bg-cream/80 px-3 py-2 sm:gap-x-6 sm:px-4"
                    role="row"
                  >
                    <div
                      role="columnheader"
                      className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-charcoal/55"
                    >
                      Tier
                    </div>
                    <div
                      role="columnheader"
                      className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-charcoal/55 text-right"
                    >
                      Score
                    </div>
                    <div
                      role="columnheader"
                      className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-charcoal/55"
                    >
                      Day ranges
                    </div>
                  </div>
                  {domBandSummary.tiers.map((tier, i) => (
                    <div
                      key={tier.id}
                      role="row"
                      className={`grid grid-cols-[minmax(0,1.2fr)_4.5rem_minmax(0,1.5fr)] gap-x-4 px-3 py-2.5 sm:gap-x-6 sm:px-4 ${
                        i > 0 ? "border-t border-charcoal/[0.06]" : ""
                      }`}
                    >
                      <div
                        role="cell"
                        className="min-w-0 font-mono text-[12px] leading-snug text-navy/90 truncate"
                        title={tier.label}
                      >
                        {tier.label}
                      </div>
                      <div
                        role="cell"
                        className="font-mono text-[12px] tabular-nums leading-snug text-navy text-right"
                      >
                        {tier.score}
                      </div>
                      <div
                        role="cell"
                        className="min-w-0 font-mono text-[12px] leading-snug text-charcoal/70"
                      >
                        {tier.ranges}
                        {tier.ranges !== "—" ? (
                          <span className="text-charcoal/40"> days</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div
                    role="row"
                    className="grid grid-cols-[minmax(0,1.2fr)_4.5rem_minmax(0,1.5fr)] gap-x-4 border-t border-charcoal/[0.1] bg-cream/50 px-3 py-2.5 sm:gap-x-6 sm:px-4"
                  >
                    <div
                      role="cell"
                      className="min-w-0 font-mono text-[12px] leading-snug text-charcoal/70"
                    >
                      Missing DOM
                      <span className="mt-0.5 block font-sans text-[11px] normal-case tracking-normal text-charcoal/45">
                        Fallback when a listing has no days-on-market
                      </span>
                    </div>
                    <div
                      role="cell"
                      className="font-mono text-[12px] tabular-nums leading-snug text-navy text-right"
                    >
                      {domBandSummary.missingScore}
                    </div>
                    <div
                      role="cell"
                      className="font-mono text-[12px] leading-snug text-charcoal/40"
                    >
                      —
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <p className="text-sm text-charcoal/65">
              First matching tier wins. Leave Max empty for open-ended (e.g.
              251+). Missing DOM on a listing uses the neutral score below.
            </p>
            <label className="inline-flex flex-wrap items-center gap-2 text-sm text-charcoal">
              <span className="font-medium">Missing DOM score</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.domMissingScore}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          domMissingScore: Math.max(0, Math.min(100, n)),
                        }
                      : prev,
                  );
                }}
                className="w-20 rounded-lg border border-charcoal/15 px-2.5 py-1.5 font-mono text-sm text-navy focus:border-navy focus:outline-none"
              />
              <span className="text-xs text-charcoal/55">0–100</span>
            </label>

            {draft.domTiers.map((tier, tierIndex) => (
              <div
                key={tier.id}
                className="rounded-xl border border-charcoal/[0.08] px-4 py-3 space-y-3"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 min-w-[10rem] flex-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/50">
                      Tier label
                    </span>
                    <input
                      type="text"
                      value={tier.label}
                      onChange={(e) =>
                        updateDomTier(tierIndex, { label: e.target.value })
                      }
                      className="rounded-lg border border-charcoal/15 px-2.5 py-1.5 text-sm text-navy focus:border-navy focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 w-24">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/50">
                      Score
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={tier.score}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        updateDomTier(tierIndex, {
                          score: Math.max(0, Math.min(100, n)),
                        });
                      }}
                      className="rounded-lg border border-charcoal/15 px-2.5 py-1.5 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeDomTier(tierIndex)}
                    disabled={draft.domTiers.length <= 1}
                    className="rounded-full border border-charcoal/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/55 hover:border-coral/40 hover:text-coral disabled:opacity-30"
                  >
                    Remove tier
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/45">
                    Day ranges (inclusive)
                  </p>
                  {tier.ranges.map((range, rangeIndex) => (
                    <div
                      key={`${tier.id}-r${rangeIndex}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <label className="inline-flex items-center gap-1.5 text-xs text-charcoal/70">
                        Min
                        <input
                          type="number"
                          min={0}
                          value={range.minDays}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            updateDomRange(tierIndex, rangeIndex, {
                              minDays: Math.max(0, Math.round(n)),
                            });
                          }}
                          className="w-20 rounded-lg border border-charcoal/15 px-2 py-1 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs text-charcoal/70">
                        Max
                        <input
                          type="number"
                          min={0}
                          placeholder="∞"
                          value={range.maxDays ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === "") {
                              updateDomRange(tierIndex, rangeIndex, {
                                maxDays: null,
                              });
                              return;
                            }
                            const n = Number(raw);
                            if (!Number.isFinite(n)) return;
                            updateDomRange(tierIndex, rangeIndex, {
                              maxDays: Math.max(0, Math.round(n)),
                            });
                          }}
                          className="w-20 rounded-lg border border-charcoal/15 px-2 py-1 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeDomRange(tierIndex, rangeIndex)}
                        disabled={tier.ranges.length <= 1}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/40 hover:text-coral disabled:opacity-30"
                      >
                        Remove range
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addDomRange(tierIndex)}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-navy/70 hover:text-navy"
                  >
                    + Add range
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addDomTier}
              className="rounded-full border border-charcoal/15 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 transition-colors hover:border-charcoal/30 hover:text-navy"
            >
              + Add DOM tier
            </button>
          </div>
        ) : null}
      </div>

      <div
        role="tabpanel"
        hidden={subPanel !== "characteristics"}
        className={
          subPanel === "characteristics"
            ? "overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
            : undefined
        }
      >
        {subPanel === "characteristics" ? (
          <div className="px-5 py-5 sm:px-6">
            <p className="mb-4 max-w-2xl text-sm text-charcoal/65">
              Remark phrases the scorer matches as whole words / phrases
              (case-insensitive — “dated” will not match inside “updated”). Add
              or remove phrases per group.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {keywordGroups.map((group) => {
                const phrases = keywordLists[group.id] ?? [];
                const savedCount = normalizeKeywordList(phrases).length;
                return (
                  <div
                    key={group.id}
                    className="flex flex-col gap-2 rounded-xl border border-charcoal/[0.08] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-charcoal">
                        {group.label}
                      </p>
                      <p className="mt-0.5 text-xs text-charcoal/55">
                        {group.hint}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {phrases.length === 0 ? (
                        <p className="font-mono text-[10px] text-charcoal/40">
                          No phrases — add one below.
                        </p>
                      ) : (
                        phrases.map((phrase, index) => (
                          <div
                            key={`${group.id}-${index}`}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={phrase}
                              onChange={(e) =>
                                updateKeywordPhrase(
                                  group.id,
                                  index,
                                  e.target.value,
                                )
                              }
                              spellCheck={false}
                              aria-label={`${group.label} phrase ${index + 1}`}
                              className="min-w-0 flex-1 rounded-lg border border-charcoal/15 px-2.5 py-1.5 font-mono text-xs text-navy focus:border-navy focus:outline-none"
                              placeholder="e.g. renovated"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeKeywordPhrase(group.id, index)
                              }
                              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/40 hover:text-coral"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => addKeywordPhrase(group.id)}
                        className="font-mono text-[10px] uppercase tracking-[0.12em] text-navy/70 hover:text-navy"
                      >
                        + Add phrase
                      </button>
                      <span className="font-mono text-[10px] text-charcoal/40">
                        {savedCount} phrase{savedCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {actionsBar}
    </div>
  );
}
