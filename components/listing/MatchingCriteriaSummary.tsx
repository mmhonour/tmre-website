"use client";

import { useState } from "react";
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
  key: "bed" | "bath" | "vintage" | "sqft" | "lot";
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
    ? "bg-gradient-to-b from-white to-cream text-navy border-charcoal/20 shadow-[0_2px_0_0_rgba(28,42,58,0.22),0_3px_6px_rgba(28,42,58,0.12)] hover:from-cream hover:to-white active:translate-y-px active:shadow-[0_1px_0_0_rgba(28,42,58,0.2)]"
    : "bg-gradient-to-b from-white/25 to-white/10 text-white border-white/35 shadow-[0_2px_0_0_rgba(0,0,0,0.35),0_3px_8px_rgba(0,0,0,0.25)] hover:from-white/35 hover:to-white/15 active:translate-y-px active:shadow-[0_1px_0_0_rgba(0,0,0,0.35)]";
  const disabledClass = isModal
    ? "bg-cream/60 text-charcoal/25 border-charcoal/10 shadow-none cursor-not-allowed"
    : "bg-white/5 text-white/25 border-white/10 shadow-none cursor-not-allowed";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label === "+" ? "Increase criterion" : "Decrease criterion"}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border font-mono text-[12px] font-bold leading-none transition-[transform,box-shadow,background] ${
        disabled ? disabledClass : enabledClass
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Horizontal "Matching …" criteria line used by Sales, Rentals, and What if.
 * Every bracketed tolerance/vintage is a toggle: click (or hover for the
 * tooltip) to swap the compact "[±1]" bracket for the actual bounds
 * ("3–5 bed"); click again to collapse back.
 *
 * When `session` + `onSessionChange` are provided (Sales/Rentals), each
 * criterion also gets raised +/- steppers for the current tab session.
 */
export default function MatchingCriteriaSummary({
  criteria,
  tolerances,
  session,
  onSessionChange,
  isModal = false,
}: {
  criteria: ComparablesCriteria;
  /** Legacy display-only tolerances (What if). Ignored when `session` is set. */
  tolerances?: MatchCriteriaTolerances;
  session?: SessionMatchOverrides;
  onSessionChange?: (next: SessionMatchOverrides) => void;
  isModal?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const valueClass = "text-gold";
  const linkClass = isModal
    ? "text-slate underline decoration-slate/40 underline-offset-2 hover:text-navy transition-colors cursor-pointer"
    : "text-white/60 underline decoration-white/40 underline-offset-2 hover:text-white transition-colors cursor-pointer";

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
    onSessionChange(next);
  };

  return (
    <>
      <span className={valueClass}>{criteria.zip}</span>
      {bounds.map((bound) => {
        const isOpen = expanded[bound.key];
        return (
          <span key={bound.key} className="inline-flex items-center gap-1">
            <span>{" · "}</span>
            {bound.label && !isOpen ? (
              <span className={valueClass}>{`${bound.label} `}</span>
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
            {editable ? (
              <span className="inline-flex items-center gap-0.5 ml-0.5">
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
          </span>
        );
      })}
    </>
  );
}
