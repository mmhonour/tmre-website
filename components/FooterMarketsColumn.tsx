"use client";

import Link from "next/link";
import { useState } from "react";
import { useCoverageTowns } from "@/components/CoverageTownsProvider";

export default function FooterMarketsColumn() {
  const [expanded, setExpanded] = useState(false);
  const { towns } = useCoverageTowns();

  return (
    <div>
      <h4 className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-5">
        Markets
      </h4>
      <ul className="space-y-3">
        <li>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-2 text-sm text-white/75 hover:text-gold transition-colors text-left"
          >
            <span
              className="font-mono text-[11px] leading-none text-gold font-bold w-4 shrink-0 text-center"
              aria-hidden
            >
              {expanded ? "−" : "+"}
            </span>
            <span>Lower Fairfield County</span>
          </button>
          {expanded ? (
            <ul className="mt-2 ml-6 space-y-2 border-l border-white/10 pl-3">
              {towns.map((town) => (
                <li key={town}>
                  <Link
                    href={`/intelligence?city=${encodeURIComponent(town)}`}
                    className="text-sm text-white/60 hover:text-gold transition-colors"
                  >
                    {town}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        <li>
          <Link
            href="/intelligence"
            className="text-sm text-white/75 hover:text-gold transition-colors"
          >
            Live Deal Board
          </Link>
        </li>
      </ul>
    </div>
  );
}
