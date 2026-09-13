"use client";

import { useId } from "react";

const svgClass = "h-5 w-5 shrink-0";

/** Lightbulb — Insight. */
export function InsightGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18h6M10 21h4" />
      <path d="M8 14.2C6.2 12.8 5 10.7 5 8.4A7 7 0 0 1 12 1.5 7 7 0 0 1 19 8.4c0 2.3-1.2 4.4-3 5.8" />
      <path d="M9 14h6v2.2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V14z" />
    </svg>
  );
}

export function MapGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

/** Yin-yang pulse — Town pulse. Gradients unique per mount. */
export function PulseGlyph() {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={svgClass} aria-hidden>
      <defs>
        <radialGradient
          id={`${uid}-yin`}
          cx="12"
          cy="7.8"
          r="8.4"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#4A7C6F" />
          <stop offset="1" stopColor="#C8A951" />
        </radialGradient>
        <radialGradient id={`${uid}-eyeGreen`}>
          <stop offset="0" stopColor="#FF2A22" />
          <stop offset="1" stopColor="#4A7C6F" />
        </radialGradient>
        <radialGradient id={`${uid}-eyeRed`}>
          <stop offset="0" stopColor="#C8A951" />
          <stop offset="0.48" stopColor="#FF2A22" />
          <stop offset="1" stopColor="#FF2A22" />
        </radialGradient>
      </defs>
      <g transform="rotate(-60 12 12)">
        <circle cx="12" cy="12" r="8.4" fill={`url(#${uid}-yin)`} />
        <path
          d="M12 3.6 A8.4 8.4 0 0 0 12 20.4 A4.2 4.2 0 0 0 12 12 A4.2 4.2 0 0 1 12 3.6 Z"
          fill="#FF2A22"
        />
        <circle cx="12" cy="7.8" r="2.17" fill={`url(#${uid}-eyeGreen)`} />
        <circle cx="12" cy="16.2" r="2.7" fill={`url(#${uid}-eyeRed)`} />
      </g>
    </svg>
  );
}

/** Lines + ticks — Details. */
export function DetailsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h10M4 12h16M4 17h12" />
      <circle cx="19" cy="7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="17" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Two houses — Comps. */
export function CompsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 11.5 7 7.5l4.5 4" />
      <path d="M4 11.2V18h6v-5.2" />
      <path d="M10.5 12.2 16 7.2 21.5 12" />
      <path d="M12 12V18h8v-6.5" />
    </svg>
  );
}

/** Forked path — What if (sale / rent branch). */
export function WhatIfGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h6" />
      <path d="M11 12 17 6" />
      <path d="M11 12 17 18" />
      <path d="M17 6h3" />
      <path d="M17 18h3" />
      <circle cx="21" cy="6" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="21" cy="18" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Window maximize — expand rail icons to their words. */
export function MaximizeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="5" width="14" height="14" rx="1.2" />
    </svg>
  );
}

/** Window minimize — collapse rail labels back to icons. */
export function MinimizeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={svgClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 18h12" />
    </svg>
  );
}

export const SHOWCASE_RAIL_GLYPH_PROPOSAL = [
  { id: "insight", label: "Insight", note: "Lightbulb (existing)" },
  { id: "details", label: "Details", note: "List lines with ticks (existing)" },
  { id: "comps", label: "Comps", note: "Two houses side by side" },
  { id: "what-if", label: "What if", note: "Forked path — sale / rent branch" },
  { id: "map", label: "Map", note: "Folded map (existing)" },
  { id: "pulse", label: "Town pulse", note: "Yin-yang pulse (existing)" },
] as const;
