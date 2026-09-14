"use client";

import { useEffect, useState } from "react";
import DealDayTownBleed, {
  DEAL_TOWN_BLEED_LABELS,
  dealTownBleedPattern,
} from "@/components/DealDayTownBleed";

const TOWNS = [
  "Westport",
  "Weston",
  "Wilton",
  "Darien",
  "New Canaan",
  "Ridgefield",
] as const;

const PREVIEW_CYCLE_MS = 2800;

export function DodTownBleedStage({
  variant,
  chrome = "fixture",
}: {
  variant: "desktop" | "mobile";
  chrome?: "fixture" | "site";
}) {
  const [index, setIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<"next" | "prev" | null>("next");
  const [paused, setPaused] = useState(false);
  const mobile = variant === "mobile";
  const framed = mobile && chrome === "fixture";
  const town = TOWNS[index];
  const pattern = dealTownBleedPattern(index);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setSlideDir("next");
      setIndex((i) => (i + 1) % TOWNS.length);
    }, PREVIEW_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const step = (dir: "next" | "prev") => {
    setSlideDir(dir);
    setIndex((i) =>
      dir === "next"
        ? (i + 1) % TOWNS.length
        : (i - 1 + TOWNS.length) % TOWNS.length,
    );
  };

  return (
    <section
      className={`listing-showcase-type relative overflow-hidden navy-gradient ${
        framed ? "h-[844px] w-[390px]" : "min-h-[100dvh] w-full"
      }`}
    >
      <div className="absolute inset-0 hero-grid opacity-60" aria-hidden />
      <div
        className={`relative mx-auto max-w-7xl px-6 ${
          framed ? "pt-16 pb-8" : "pt-24 pb-12 lg:px-10 lg:pt-28"
        }`}
      >
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gold/80">
          Deal of the Day · {DEAL_TOWN_BLEED_LABELS[pattern]}
        </p>
        <div className="relative">
          <DealDayTownBleed carouselIndex={index} slideDir={slideDir} />
          <div className="relative z-[1] space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-gold">
              {town}
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/45">
              Below the town median · established homes
            </p>
            <h1
              className={`font-serif leading-[1.05] tracking-tight text-white ${
                mobile ? "text-4xl" : "text-6xl lg:text-7xl"
              }`}
            >
              Today&apos;s <span className="italic gold-shimmer">87.2.</span>
              <br />
              <span className="italic text-white/85">One listing.</span>
            </h1>
            <div
              className={`overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-navy-light to-navy-dark ${
                mobile ? "aspect-[16/9]" : "aspect-[16/9] max-w-xl"
              }`}
            />
            <div className="flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-white/70"
                aria-label={paused ? "Resume" : "Pause"}
              >
                {paused ? "▶" : "⏸"}
              </button>
              <button
                type="button"
                onClick={() => step("prev")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-white/70"
                aria-label="Previous town"
              >
                ‹
              </button>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/85">
                {town}, CT · {index + 1}/{TOWNS.length}
              </p>
              <button
                type="button"
                onClick={() => step("next")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-white/70"
                aria-label="Next town"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
