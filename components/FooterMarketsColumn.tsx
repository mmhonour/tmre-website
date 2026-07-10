"use client";

import Link from "next/link";
import { useState } from "react";
import { TMRE_TOWNS } from "@/lib/tmre-towns";

const OTHER_MARKET_LINKS = [
  { href: "/intelligence", label: "Live Deal Board" },
  { href: "/intelligence", label: "Market Pulse" },
] as const;

export default function FooterMarketsColumn() {
  const [expanded, setExpanded] = useState(false);

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
              {TMRE_TOWNS.map((town) => (
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
        {OTHER_MARKET_LINKS.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-white/75 hover:text-gold transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
