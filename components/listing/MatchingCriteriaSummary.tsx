"use client";

import { useEffect, useRef, useState } from "react";
import {
  fmtAcres,
  fmtSqft,
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
  shrinkVintageLabels,
  type SessionMatchOverrides,
} from "@/lib/listing-comparables-session";
import { VINTAGE_BUCKETS } from "@/lib/vintage-buckets";

export type CriteriaStepKey = "bed" | "bath" | "vintage" | "sqft" | "lot";

export type CriteriaStepFeedback = {
  key: CriteriaStepKey;
  text: string;
};

/** Acres value without the unit suffix, for ranges like "0.22–0.52 ac". */
function acresValue(acres: number): string {
  if (acres < 0.01) return "<0.01";
  if (acres < 10) return acres.toFixed(2);
  return acres.toFixed(1);
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
  /** Whole percent, e.g. 40 for ±40%. */
  lotTolerancePct?: number;
};

type CriteriaBound = {
  key: CriteriaStepKey;
  /** Text left of the bracket (empty for the vintage token). */
  label: string;
  /** Compact bracket contents, e.g. "±1" or "Pre-1900, 1900–1940". */
  token: string;
  /** Expanded bounds, e.g. "3–5 bed" or "< 1900–1940". */
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
  const lotPct = session.lotTolerancePct;
  const sqftFrac = sqftPct / 100;
  const lotFrac = lotPct / 100;
  const vintageLabels = session.allowedVintageLabels;

  const bounds: CriteriaBound[] = [
    {
      key: "bed",
      label: `${criteria.beds} bed`,
      token: `±${bedTol}`,
      expanded: `${Math.max(0, criteria.beds - bedTol)}–${criteria.beds + bedTol} bed`,
      canDecrement: bedTol > 0,
      canIncrement: bedTol < SESSION_BED_TOLERANCE_MAX,
    },
    {
      key: "bath",
      label: `${criteria.baths} bath`,
      token: `±${bathTol}`,
      expanded: `${Math.max(0, criteria.baths - bathTol)}–${criteria.baths + bathTol} bath`,
      canDecrement: bathTol > 0,
      canIncrement: bathTol < SESSION_BATH_TOLERANCE_MAX,
    },
  ];

  if (vintageLabels.length > 0) {
    bounds.push({
      key: "vintage",
      label: "",
      token: vintageLabels.join(", "),
      expanded: vintageExpandedSpan(vintageLabels),
      canDecrement: canShrinkVintage(vintageLabels, criteria.vintageLabel),
      canIncrement: canExpandVintage(vintageLabels),
    });
  }

  if (criteria.sqft != null) {
    bounds.push({
      key: "sqft",
      label: fmtSqft(criteria.sqft),
      token: `±${sqftPct}%`,
      expanded: `${Math.round(criteria.sqft * (1 - sqftFrac)).toLocaleString("en-US")}–${Math.round(
        criteria.sqft * (1 + sqftFrac),
      ).toLocaleString("en-US")} sqft`,
      canDecrement: sqftPct > 0,
      canIncrement: sqftPct < 100,
    });
  }

  if (criteria.lotAcres != null) {
    bounds.push({
      key: "lot",
      label: fmtAcres(criteria.lotAcres),
      token: `±${lotPct}%`,
      expanded: `${acresValue(criteria.lotAcres * (1 - lotFrac))}–${acresValue(
        criteria.lotAcres * (1 + lotFrac),
      )} ac`,
      canDecrement: lotPct > 0,
      canIncrement: lotPct < 100,
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
      {/* Optical center: mono +/− sit high; sans + slight nudge looks centered. */}
      <span className="relative top-px flex h-[1em] w-[1em] items-center justify-center leading-none">
        {label}
      </span>
    </button>
  );
}

/** How long ± steppers keep the expanded bounds visible (not vintage). */
const AUTO_REVEAL_MS = 10_000;

/**
 * Horizontal "Matching …" criteria line used by Sales, Rentals, and What if.
 * Compact "[±1]" sits left of the descriptor; click the bracket to toggle the
 * actual bounds ("3–5 bed"). Pressing ± also reveals those bounds for 10s
 * (vintage stays as its bracket labels — already readable).
 *
 * When `session` + `onSessionChange` are provided (Sales/Rentals), "Criteria"
 * is a disclosure control: ▶ hides ± steppers by default; click to reveal
 * (triangle flips to ◀); click again to collapse.
 */
export default function MatchingCriteriaSummary({
  criteria,
  tolerances,
  session,
  onSessionChange,
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
    // Vintage bracket already lists the buckets — no temporary expand.
    if (key === "vintage") return;
    setAutoRevealKey(key);
    if (autoRevealTimerRef.current != null) {
      clearTimeout(autoRevealTimerRef.current);
    }
    autoRevealTimerRef.current = setTimeout(() => {
      autoRevealTimerRef.current = null;
      setAutoRevealKey((current) => (current === key ? null : current));
    }, AUTO_REVEAL_MS);
  };

  const valueClass = "text-gold";
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
    lotTolerancePct: tolerances?.lotTolerancePct ?? 40,
    allowedVintageLabels: vintageCriteriaList(criteria)
      .split(" | ")
      .filter(Boolean),
  };

  const editable = Boolean(session && onSessionChange);
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
      case "lot":
        next.lotTolerancePct = bumpPercentTolerance(next.lotTolerancePct, delta);
        break;
      case "vintage":
        next.allowedVintageLabels =
          delta > 0
            ? expandVintageLabels(next.allowedVintageLabels)
            : shrinkVintageLabels(next.allowedVintageLabels, criteria.vintageLabel);
        break;
    }
    onSessionChange(next, { key });
    flashExpanded(key);
  };

  const noteClass = isModal
    ? "font-mono text-[9px] tracking-[0.08em] normal-case text-slate/80"
    : "font-mono text-[9px] tracking-[0.08em] normal-case text-white/55";

  return (
    <span className="inline-flex flex-col items-start gap-y-1">
      {editable ? (
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
            className={
              isModal
                ? "font-bold text-navy"
                : "font-bold text-white"
            }
          >
            Criteria
          </span>
          <span className={triangleBtnClass} aria-hidden>
            {controlsOpen ? "◀" : "▶"}
          </span>
        </button>
      ) : null}
      <span className={valueClass}>{criteria.zip}</span>
      {bounds.map((bound) => {
        const isOpen =
          Boolean(expanded[bound.key]) || autoRevealKey === bound.key;
        const showNote =
          stepFeedback != null && stepFeedback.key === bound.key;
        return (
          <span
            key={bound.key}
            className="inline-flex flex-wrap items-center gap-1"
          >
            {editable && controlsOpen ? (
              <span className="inline-flex items-center gap-0.5 mr-0.5">
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
            <button
              type="button"
              onClick={() => toggle(bound.key)}
              className={linkClass}
              title={isOpen ? bound.token : bound.expanded}
              aria-expanded={isOpen}
            >
              {isOpen ? bound.expanded : `[${bound.token}]`}
            </button>
            {bound.label && !isOpen ? (
              <span className={valueClass}>{bound.label}</span>
            ) : null}
            {showNote ? (
              <span className={noteClass} role="status" aria-live="polite">
                {stepFeedback.text}
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
