"use client";

import { useEffect, useRef, useState } from "react";
import FilterResetButton from "@/components/FilterResetButton";
import {
  vintageCriteriaList,
  type ComparablesCriteria,
} from "@/lib/listing-comparables-shared";
import {
  bumpBathTolerance,
  bumpBedTolerance,
  bumpPercentTolerance,
  canExpandVintage,
  canShrinkVintage,
  expandVintageLabels,
  SESSION_BATH_TOLERANCE_MAX,
  SESSION_BED_TOLERANCE_MAX,
  sessionMatchOverridesEqual,
  shrinkVintageLabels,
  type SessionMatchOverrides,
} from "@/lib/listing-comparables-session";
import { formatFurnishedCriteriaLabel } from "@/lib/listing-furnished";
import { VINTAGE_BUCKETS } from "@/lib/vintage-buckets";

export type CriteriaStepKey =
  | "bed"
  | "bath"
  | "vintage"
  | "sqft"
  | "furnish";

export type CriteriaStepFeedback = {
  key: CriteriaStepKey;
  text: string;
};

function formatSqftValue(sqft: number): string {
  return sqft.toLocaleString("en-US");
}

/**
 * Continuous vintage span for the expanded view, derived from the bracketed
 * label list (oldest → newest). Open-ended buckets read as "< 1900" / "present"
 * so e.g. [Pre-1900, 1900–1940] expands to "< 1900–1940".
 */
function vintageExpandedSpan(labels: string[]): string {
  const entries = labels
    .map((label) => {
      const idx = VINTAGE_BUCKETS.findIndex((b) => b.label === label);
      return { label, idx, id: VINTAGE_BUCKETS[idx]?.id ?? null };
    })
    .filter((e) => e.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  if (entries.length === 0) return "";

  const lower = entries[0]!;
  const upper = entries[entries.length - 1]!;

  if (entries.length === 1) {
    if (lower.id === "pre-1900") return "< 1900";
    if (lower.id === "2020-present") return "2020+";
    return lower.label;
  }

  const lowerEdge =
    lower.id === "pre-1900" ? "< 1900" : (lower.label.split("–")[0] ?? lower.label);
  const upperEdge =
    upper.id === "2020-present" ? "present" : (upper.label.split("–")[1] ?? upper.label);
  return `${lowerEdge}–${upperEdge}`;
}

export type MatchCriteriaTolerances = {
  bedTolerance?: number;
  bathTolerance?: number;
  /** Whole percent, e.g. 30 for ±30%. */
  sqftTolerancePct?: number;
};

type CriteriaBound = {
  key: CriteriaStepKey;
  /** Left column label: Beds, Baths, Vintage, SQFT, Furnish. */
  rowLabel: string;
  /** Subject value shown after the label (`n` / `n.n`). */
  value: string;
  /** Compact bracket contents, e.g. "±1" or vintage list. */
  token: string;
  /** Expanded bounds shown when the bracket is clicked. */
  expanded: string;
  canDecrement: boolean;
  canIncrement: boolean;
};

function criteriaBounds(
  criteria: ComparablesCriteria,
  session: SessionMatchOverrides,
): CriteriaBound[] {
  const bedTol = session.bedTolerance;
  const bathTol = session.bathTolerance;
  const sqftPct = session.sqftTolerancePct;
  const sqftFrac = sqftPct / 100;
  const vintageLabels = session.allowedVintageLabels;

  const bounds: CriteriaBound[] = [
    {
      key: "bed",
      rowLabel: "Beds",
      value: String(criteria.beds),
      token: `±${bedTol}`,
      expanded: `${Math.max(0, criteria.beds - bedTol)}–${criteria.beds + bedTol} Beds`,
      canDecrement: bedTol > 0,
      canIncrement: bedTol < SESSION_BED_TOLERANCE_MAX,
    },
    {
      key: "bath",
      rowLabel: "Baths",
      value: String(criteria.baths),
      token: `±${bathTol}`,
      expanded: `${Math.max(0, criteria.baths - bathTol)}–${criteria.baths + bathTol} Baths`,
      canDecrement: bathTol > 0,
      canIncrement: bathTol < SESSION_BATH_TOLERANCE_MAX,
    },
  ];

  if (vintageLabels.length > 0) {
    const span = vintageExpandedSpan(vintageLabels);
    bounds.push({
      key: "vintage",
      rowLabel: "Vintage",
      value: criteria.vintageLabel,
      token: vintageLabels.join(", "),
      expanded: span ? `Years ${span}` : "",
      canDecrement: canShrinkVintage(vintageLabels, criteria.vintageLabel),
      canIncrement: canExpandVintage(vintageLabels),
    });
  }

  if (criteria.sqft != null) {
    bounds.push({
      key: "sqft",
      rowLabel: "SQFT",
      value: formatSqftValue(criteria.sqft),
      token: `±${sqftPct}%`,
      expanded: `${formatSqftValue(Math.round(criteria.sqft * (1 - sqftFrac)))}–${formatSqftValue(
        Math.round(criteria.sqft * (1 + sqftFrac)),
      )} sqft`,
      canDecrement: sqftPct > 0,
      canIncrement: sqftPct < 100,
    });
  }

  if (criteria.furnished) {
    const label = formatFurnishedCriteriaLabel(criteria.furnished);
    const scope = session.furnishedScope ?? "exact";
    const isAny = scope === "any";
    bounds.push({
      key: "furnish",
      rowLabel: "Furnish",
      value: label,
      token: isAny ? "Any" : "exact",
      expanded: isAny
        ? "Any furnish (incl. Unfurnished)"
        : `${label} only`,
      canDecrement: isAny,
      canIncrement: !isAny,
    });
  }

  return bounds;
}

function RaisedStepButton({
  label,
  disabled,
  onClick,
  isModal,
}: {
  label: "+" | "−";
  disabled: boolean;
  onClick: () => void;
  isModal: boolean;
}) {
  const enabledClass = isModal
    ? "bg-navy/[0.08] text-navy hover:bg-navy/[0.14] active:bg-navy/[0.18]"
    : "bg-white/10 text-white hover:bg-white/18 active:bg-white/22";
  const disabledClass = isModal
    ? "bg-transparent text-charcoal/25 cursor-not-allowed"
    : "bg-transparent text-white/25 cursor-not-allowed";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label === "+" ? "Increase criterion" : "Decrease criterion"}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-0 p-0 font-sans text-[14px] font-semibold leading-none transition-colors ${
        disabled ? disabledClass : enabledClass
      }`}
    >
      <span className="relative top-px flex h-[1em] w-[1em] items-center justify-center leading-none">
        {label}
      </span>
    </button>
  );
}

/** How long ± steppers keep the expanded bounds visible. */
const AUTO_REVEAL_MS = 10_000;

/**
 * Criteria panel rows for Sales, Rentals, What if, and UAG.
 *
 *   Beds     n [±n]           (−)(+)
 *   Baths    n [±n]           (−)(+)
 *   Vintage  n [v1, v2, …]    (−)(+)
 *   SQFT     n [±n%]          (−)(+)
 *   Acres    n.n [±n%]        (−)(+)
 *   Furnish  Furnished [exact](−)(+)  — only when subject is furnished
 *
 * Click the bracket to toggle the encapsulated range. When manipulation is
 * enabled, ± buttons sit right-aligned on each row.
 */
export default function MatchingCriteriaSummary({
  criteria,
  tolerances,
  session,
  onSessionChange,
  baseline = null,
  onReset,
  stepFeedback = null,
  isModal = false,
  /** Side panel / drawer: open ± steppers by default. */
  defaultControlsOpen = false,
}: {
  criteria: ComparablesCriteria;
  /** Legacy display-only tolerances (What if). Ignored when `session` is set. */
  tolerances?: MatchCriteriaTolerances;
  session?: SessionMatchOverrides;
  onSessionChange?: (
    next: SessionMatchOverrides,
    source?: { key: CriteriaStepKey },
  ) => void;
  /** Original seeded overrides — enables the Intelligence-style reset control. */
  baseline?: SessionMatchOverrides | null;
  onReset?: () => void;
  /** Short find/no-find note shown next to the ± that was last pressed. */
  stepFeedback?: CriteriaStepFeedback | null;
  isModal?: boolean;
  defaultControlsOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [autoRevealKey, setAutoRevealKey] = useState<CriteriaStepKey | null>(
    null,
  );
  const autoRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsOpen, setControlsOpen] = useState(defaultControlsOpen);

  useEffect(() => {
    return () => {
      if (autoRevealTimerRef.current != null) {
        clearTimeout(autoRevealTimerRef.current);
      }
    };
  }, []);

  const toggle = (key: CriteriaStepKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const flashExpanded = (key: CriteriaStepKey) => {
    setAutoRevealKey(key);
    if (autoRevealTimerRef.current != null) {
      clearTimeout(autoRevealTimerRef.current);
    }
    autoRevealTimerRef.current = setTimeout(() => {
      autoRevealTimerRef.current = null;
      setAutoRevealKey((current) => (current === key ? null : current));
    }, AUTO_REVEAL_MS);
  };

  const valueClass = "text-gold tabular-nums";
  const labelClass = isModal
    ? "font-mono text-[10px] tracking-[0.12em] uppercase text-navy/70"
    : "font-mono text-[10px] tracking-[0.12em] uppercase text-white/55";
  const linkClass = isModal
    ? "text-slate underline decoration-slate/40 underline-offset-2 hover:text-navy transition-colors cursor-pointer"
    : "text-white/60 underline decoration-white/40 underline-offset-2 hover:text-white transition-colors cursor-pointer";
  const triangleBtnClass = isModal
    ? "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-charcoal/25 bg-white text-navy/80 shadow-sm transition-colors hover:border-gold/40 hover:text-navy"
    : "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/30 bg-white/10 text-white shadow-sm transition-colors hover:border-gold/50 hover:bg-white/15 hover:text-gold";

  const effectiveSession: SessionMatchOverrides = session ?? {
    bedTolerance: tolerances?.bedTolerance ?? 1,
    bathTolerance: tolerances?.bathTolerance ?? 1,
    sqftTolerancePct: tolerances?.sqftTolerancePct ?? 30,
    allowedVintageLabels: vintageCriteriaList(criteria)
      .split(" | ")
      .filter(Boolean),
    ...(criteria.furnished ? { furnishedScope: "exact" as const } : {}),
  };

  const editable = Boolean(session && onSessionChange);
  const canReset = Boolean(
    editable &&
      onReset &&
      session &&
      baseline &&
      !sessionMatchOverridesEqual(session, baseline),
  );
  const bounds = criteriaBounds(criteria, effectiveSession);

  const bump = (key: CriteriaBound["key"], delta: 1 | -1) => {
    if (!onSessionChange) return;
    const next = { ...effectiveSession };
    switch (key) {
      case "bed":
        next.bedTolerance = bumpBedTolerance(next.bedTolerance, delta);
        break;
      case "bath":
        next.bathTolerance = bumpBathTolerance(next.bathTolerance, delta);
        break;
      case "sqft":
        next.sqftTolerancePct = bumpPercentTolerance(next.sqftTolerancePct, delta);
        break;
      case "vintage":
        next.allowedVintageLabels =
          delta > 0
            ? expandVintageLabels(next.allowedVintageLabels)
            : shrinkVintageLabels(next.allowedVintageLabels, criteria.vintageLabel);
        break;
      case "furnish":
        if (!criteria.furnished) break;
        next.furnishedScope = delta > 0 ? "any" : "exact";
        break;
    }
    onSessionChange(next, { key });
    flashExpanded(key);
  };

  const noteClass = isModal
    ? "font-mono text-[9px] tracking-[0.08em] normal-case text-slate/80"
    : "font-mono text-[9px] tracking-[0.08em] normal-case text-white/55";

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-y-1.5">
      {editable ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setControlsOpen((open) => !open)}
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors"
            aria-expanded={controlsOpen}
            aria-label={
              controlsOpen
                ? "Hide criteria adjustment controls"
                : "Show criteria adjustment controls"
            }
          >
            <span
              className={isModal ? "font-bold text-navy" : "font-bold text-white"}
            >
              Criteria
            </span>
            <span className={triangleBtnClass} aria-hidden>
              {controlsOpen ? "◀" : "▶"}
            </span>
          </button>
          {onReset ? (
            <FilterResetButton
              onClick={onReset}
              disabled={!canReset}
              label="Reset criteria"
              tone={isModal ? "onLight" : "onDark"}
            />
          ) : null}
        </div>
      ) : null}

      <div className={`font-mono text-[10px] tracking-[0.12em] ${valueClass}`}>
        {criteria.zip}
      </div>

      {bounds.map((bound) => {
        const isOpen =
          Boolean(expanded[bound.key]) || autoRevealKey === bound.key;
        const showNote =
          stepFeedback != null && stepFeedback.key === bound.key;
        return (
          <div
            key={bound.key}
            className="flex w-full min-w-0 items-center gap-x-2 gap-y-0.5"
          >
            <span className={`w-[4.5rem] shrink-0 ${labelClass}`}>
              {bound.rowLabel}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className={valueClass}>{bound.value}</span>
              <button
                type="button"
                onClick={() => toggle(bound.key)}
                className={linkClass}
                title={isOpen ? bound.token : bound.expanded}
                aria-expanded={isOpen}
              >
                {isOpen ? bound.expanded : `[${bound.token}]`}
              </button>
              {showNote ? (
                <span className={noteClass} role="status" aria-live="polite">
                  {stepFeedback.text}
                </span>
              ) : null}
            </div>
            {editable && controlsOpen ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
                <RaisedStepButton
                  label="−"
                  disabled={!bound.canDecrement}
                  onClick={() => bump(bound.key, -1)}
                  isModal={isModal}
                />
                <RaisedStepButton
                  label="+"
                  disabled={!bound.canIncrement}
                  onClick={() => bump(bound.key, 1)}
                  isModal={isModal}
                />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
