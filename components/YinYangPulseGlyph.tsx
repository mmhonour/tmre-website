"use client";

import { useId } from "react";

/** Saturated red — `--color-coral` (#C85A3A) reads burnt orange at icon size. */
const PULSE_RED = "#FF2A22";

/**
 * Town-pulse yin-yang finalized 02 Sep 12:26.
 *
 * Two teardrops on the 10 / 4 axis, 30% inset. Yin is 85% sage, then yellow
 * at the tail. Yang is red, with a yellow eye ringed in red so the yellow
 * does not take over the bulb.
 */
export default function YinYangPulseGlyph({
  className = "h-full w-full",
}: {
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const yin = `${uid}-yin`;
  const eyeOnGreen = `${uid}-eye-green`;
  const eyeOnRed = `${uid}-eye-red`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <radialGradient
          id={yin}
          cx="12"
          cy="7.8"
          r="8.4"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--color-sage)" />
          <stop offset="0.85" stopColor="var(--color-sage)" />
          <stop offset="1" stopColor="var(--color-gold)" />
        </radialGradient>
        <radialGradient id={eyeOnGreen}>
          <stop offset="0" stopColor={PULSE_RED} />
          <stop offset="0.34" stopColor={PULSE_RED} />
          <stop offset="1" stopColor="var(--color-sage)" />
        </radialGradient>
        {/* Yellow core, then red collar so the yang head stays red around the dot. */}
        <radialGradient id={eyeOnRed}>
          <stop offset="0" stopColor="var(--color-gold)" />
          <stop offset="0.22" stopColor="var(--color-gold)" />
          <stop offset="0.48" stopColor={PULSE_RED} />
          <stop offset="1" stopColor={PULSE_RED} />
        </radialGradient>
      </defs>
      <g transform="rotate(-60 12 12)">
        <circle cx="12" cy="12" r="8.4" fill={`url(#${yin})`} />
        <path
          d="M12 3.6 A8.4 8.4 0 0 0 12 20.4 A4.2 4.2 0 0 0 12 12 A4.2 4.2 0 0 1 12 3.6 Z"
          fill={PULSE_RED}
        />
        <circle cx="12" cy="7.8" r="2.17" fill={`url(#${eyeOnGreen})`} />
        <circle cx="12" cy="16.2" r="2.7" fill={`url(#${eyeOnRed})`} />
      </g>
    </svg>
  );
}
