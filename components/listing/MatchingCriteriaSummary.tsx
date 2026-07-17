"use client";

import { useState } from "react";
import {
  fmtAcres,
  fmtSqft,
  vintageCriteriaList,
  type ComparablesCriteria,
} from "@/lib/listing-comparables-shared";
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
function vintageExpandedSpan(vintageList: string): string {
  const labels = vintageList.split(" | ").filter(Boolean);
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
  key: string;
  /** Text left of the bracket (empty for the vintage token). */
  label: string;
  /** Compact bracket contents, e.g. "±1" or "Pre-1900, 1900–1940". */
  token: string;
  /** Expanded bounds, e.g. "3–5 bed" or "< 1900–1940". */
  expanded: string;
};

function criteriaBounds(
  criteria: ComparablesCriteria,
  tolerances: MatchCriteriaTolerances = {},
): CriteriaBound[] {
  const bedTol = tolerances.bedTolerance ?? 1;
  const bathTol = tolerances.bathTolerance ?? 1;
  const sqftPct = tolerances.sqftTolerancePct ?? 30;
  const lotPct = tolerances.lotTolerancePct ?? 40;
  const sqftFrac = sqftPct / 100;
  const lotFrac = lotPct / 100;

  const bounds: CriteriaBound[] = [
    {
      key: "bed",
      label: `${criteria.beds} bed`,
      token: `±${bedTol}`,
      expanded: `${Math.max(0, criteria.beds - bedTol)}–${criteria.beds + bedTol} bed`,
    },
    {
      key: "bath",
      label: `${criteria.baths} bath`,
      token: `±${bathTol}`,
      expanded: `${Math.max(0, criteria.baths - bathTol)}–${criteria.baths + bathTol} bath`,
    },
  ];

  const vintages = vintageCriteriaList(criteria);
  if (vintages) {
    bounds.push({
      key: "vintage",
      label: "",
      token: vintages.split(" | ").join(", "),
      expanded: vintageExpandedSpan(vintages),
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
    });
  }

  return bounds;
}

/**
 * Horizontal "Matching …" criteria line used by Sales, Rentals, and What if.
 * Every bracketed tolerance/vintage is a toggle: click (or hover for the
 * tooltip) to swap the compact "[±1]" bracket for the actual bounds
 * ("3–5 bed"); click again to collapse back.
 */
export default function MatchingCriteriaSummary({
  criteria,
  tolerances,
  isModal = false,
}: {
  criteria: ComparablesCriteria;
  tolerances?: MatchCriteriaTolerances;
  isModal?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const valueClass = "text-gold";
  const linkClass = isModal
    ? "text-slate underline decoration-slate/40 underline-offset-2 hover:text-navy transition-colors cursor-pointer"
    : "text-white/60 underline decoration-white/40 underline-offset-2 hover:text-white transition-colors cursor-pointer";

  const bounds = criteriaBounds(criteria, tolerances);

  return (
    <>
      <span className={valueClass}>{criteria.zip}</span>
      {bounds.map((bound) => {
        const isOpen = expanded[bound.key];
        return (
          <span key={bound.key}>
            {" · "}
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
          </span>
        );
      })}
    </>
  );
}
