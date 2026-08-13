"use client";

import { useEffect, useState } from "react";

const MOBILE_MQ = "(max-width: 639px)";
const COMPACT_AFTER_MS = 5_000;

/**
 * Market Pulse page hero. On phones, after a short read pause the eyebrow,
 * dek, and timestamp roll up so only “Market Pulse.” remains.
 */
export default function MarketPulseHero({
  etDate,
  townsLabel,
}: {
  etDate: string;
  townsLabel: string;
}) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const sync = () => {
      if (!mq.matches) {
        clearTimer();
        setCompact(false);
        return;
      }
      clearTimer();
      timer = window.setTimeout(() => setCompact(true), COMPACT_AFTER_MS);
    };

    sync();
    mq.addEventListener("change", sync);
    return () => {
      clearTimer();
      mq.removeEventListener("change", sync);
    };
  }, []);

  const roll =
    "grid transition-[grid-template-rows] duration-700 ease-in-out motion-reduce:transition-none";
  const rollInner = "overflow-hidden";

  return (
    <section
      className={`navy-gradient text-white relative overflow-hidden transition-[padding] duration-700 ease-in-out motion-reduce:transition-none ${
        compact ? "pt-20 pb-4" : "pt-20 pb-8 lg:pt-28 lg:pb-12"
      }`}
    >
      <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div
          className={`${roll} ${compact ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
          aria-hidden={compact || undefined}
        >
          <div className={rollInner}>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
              Markets
            </p>
          </div>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
          Market <span className="italic gold-shimmer">Pulse.</span>
        </h1>
        <div
          className={`${roll} ${compact ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
          aria-hidden={compact || undefined}
        >
          <div className={rollInner}>
            <p className="mt-3 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
              The live web edition of the Monday brief for {townsLabel} — active
              inventory, months supply, and closed sales across the trailing two
              years, by town and property type, plus Deal of the Week.
            </p>
            <p className="mt-4 font-mono text-[10px] tracking-[0.14em] uppercase text-white/45 animate-fade-up-delay-2">
              As of {etDate} ET
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
