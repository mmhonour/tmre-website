"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { HomeMarketPulseTown } from "@/lib/home-market-pulse-types";
import {
  interestingStatHref,
  interestingStatWarmUrls,
  type InterestingStatKind,
} from "@/lib/interesting-stat-link";
import { dealOfTheDayHref } from "@/lib/listing-url";
import { prefetchTabJson } from "@/lib/tab-data-prefetch";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

/**
 * Hero score ↔ interesting-stat beat (one town at a time).
 *
 * Desktop (lg+): sequential handoff —
 *   score hold → stat fades up/in (score stays) → then score fades out →
 *   stat hold → next town’s score fades in (stat stays) → then stat fades out.
 *
 * Mobile (< lg): score and stat share the screen for the same town, then
 * both fade out and the next town’s pair fades in together.
 *
 * Narrow viewports use longer fades/holds (must match hero layout < lg, not < sm).
 */
const HERO_FADE_MS = 2_100; // desktop (lg+) fade-ins / fade-outs
const HERO_SCORE_HOLD_MS = 2_600;
const HERO_STAT_HOLD_MS = 3_200;
const HERO_FADE_MS_MOBILE = 3_400;
/** Both score + stat stay on screen together before the next town. */
const HERO_TOGETHER_HOLD_MS_MOBILE = 7_200;
/** Match `lg:` layout breakpoint — below this the hero is still “mobile.” */
const HERO_NARROW_MQ = "(max-width: 1023px)";

function readHeroNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(HERO_NARROW_MQ).matches;
}

/**
 * Hero body copy as short phrases (visual wrap ≈ a few words at a time).
 * Collapses last→first until only the H1 remains; reopen via “Giving buyers…”.
 */
const HERO_COPY_PARAS: readonly (readonly string[])[] = [
  [
    "Giving buyers and owners",
    "a single, town-calibrated measure.",
    "Relative value, market context,",
    "and deal shape — scored and synthesized",
    "so you spend time effectively.",
  ],
  [
    "Use Market Intelligence, Statistics,",
    'and "What If" scenarios',
    "to read the room.",
  ],
  [
    "High means the home clears the bar",
    "against what's active nearby.",
    "Softer means dig deeper —",
    "or price with eyes open if you are selling.",
    "Same yardstick everywhere on the site.",
  ],
];

const HERO_COPY_PHRASES: readonly string[] = HERO_COPY_PARAS.flat();

/** Pause after first paint so the full copy can be read once. */
const HERO_COPY_READ_MS = 4_200;
/** Per-phrase fade-out duration. */
const HERO_COPY_PHRASE_FADE_MS = 700;
/** Gap after a phrase finishes before the previous one starts fading. */
const HERO_COPY_PHRASE_STAGGER_MS = 160;

type HeroBeat =
  | "score-in"
  | "score-hold"
  /** Score stays full; same-town stat fades up and in. */
  | "stat-in"
  /** Stat is full; town score fades out. */
  | "score-out"
  | "stat-hold"
  /** Next town’s score fades in; previous town’s stat stays full. */
  | "score-in-next"
  /** New score is full; previous stat fades out. */
  | "stat-out";

type ScoreSample = {
  town: TmreTown;
  score: number;
  mlsId: string;
  listingKey?: string | null;
};

type InterestingStat = {
  eyebrow: string;
  value: string;
  detail: string;
  href: string;
  kind?: InterestingStatKind;
  town?: TmreTown | null;
};

type SurfaceId = "intelligence" | "spotlight" | "statistics" | "whatif";

type SurfaceMock = {
  id: SurfaceId;
  name: string;
  href: string;
  /** Teaser spoken before this preview fades in. */
  teaser: string;
  rotate: string;
};

/** Buyer/seller objectives — each pill routes to a page that can fulfill it. */
const FILTER_SIGNALS = [
  { label: "Ready now", href: "/intelligence" },
  { label: "Room to grow", href: "/intelligence" },
  { label: "Ask vs worth", href: "/score" },
  { label: "Hold or list", href: "/score" },
  { label: "Walkable core", href: "/find" },
  { label: "Quiet street", href: "/find" },
  { label: "Below rebuild", href: "/fixer-uppers" },
  { label: "School fit", href: "/intelligence" },
  { label: "Light remodel", href: "/fixer-uppers" },
  { label: "Income angle", href: "/intelligence" },
] as const;

/** Stable off-level angles + vertical offsets so pills never sit on one straight line. */
const PILL_TILTS = [-3.6, 2.4, -1.8, 3.2, -2.7, 1.5, -3.1, 2.8, -1.2, 2.0] as const;
const PILL_Y = [-6, 8, 1, 10, -4, 7, -8, 4, 9, -3] as const;
const PILL_MIN_VISIBLE = 3;
const PILL_MAX_VISIBLE = 5;
/** Match hero-ish fades so pills don’t pop faster than score/stat. */
const PILL_FADE_MS = 2_100;
const PILL_FADE_MS_MOBILE = 2_800;
const PILL_HOLD_MS = 2_400;
const PILL_HOLD_MS_MOBILE = 3_600;

const SURFACES: SurfaceMock[] = [
  {
    id: "intelligence",
    name: "Intelligence",
    href: "/intelligence",
    teaser: "Compare every listing…",
    rotate: "-5deg",
  },
  {
    id: "spotlight",
    name: "Spotlight",
    href: "/spotlight",
    teaser: "Today’s one pick…",
    rotate: "3.5deg",
  },
  {
    id: "statistics",
    name: "Statistics",
    href: "/stats",
    teaser: "See the charts…",
    rotate: "-2deg",
  },
  {
    id: "whatif",
    name: "What if",
    href: "/score",
    teaser: "Run a scenario…",
    rotate: "4deg",
  },
];

const SURFACE_TEASER_MS = 2400;
const SURFACE_FADE_MS = 1200;
const SURFACE_HOLD_MS = 7000;

/** Pill show/hide cadence — 75% slower than the original timers (×1.75). */
const PILL_TIME_SCALE = 1.75;
function formatPulsePrice(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? m.toFixed(1) : m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Town pulse fallback when history has no insight for the carousel town. */
function townPulseStat(
  pulse: HomeMarketPulseTown,
  rotateIndex: number,
): InterestingStat {
  const options: InterestingStat[] = [];
  const price = formatPulsePrice(pulse.medianPrice);
  if (price) {
    options.push({
      eyebrow: "Town pulse",
      value: price,
      detail: `Median sale price · ${pulse.town}`,
      href: interestingStatHref("median-price", pulse.town),
      kind: "median-price",
      town: pulse.town,
    });
  }
  if (pulse.daysOnMarket != null && Number.isFinite(pulse.daysOnMarket)) {
    options.push({
      eyebrow: "Town pulse",
      value: `${Math.round(pulse.daysOnMarket)}d`,
      detail: `Avg days on market · ${pulse.town}`,
      href: interestingStatHref("avg-dom", pulse.town),
      kind: "avg-dom",
      town: pulse.town,
    });
  }
  if (pulse.monthsSupply != null && Number.isFinite(pulse.monthsSupply)) {
    options.push({
      eyebrow: "Town pulse",
      value: `${pulse.monthsSupply.toFixed(1)} mo`,
      detail: `Months of supply · ${pulse.town}`,
      href: interestingStatHref("months-supply", pulse.town),
      kind: "months-supply",
      town: pulse.town,
    });
  }
  if (options.length === 0) {
    return {
      eyebrow: "Town pulse",
      value: pulse.town,
      detail: pulse.tagline || "Live market snapshot",
      href: "/stats",
      town: pulse.town,
    };
  }
  return options[rotateIndex % options.length]!;
}

function pickInterestingForTown(
  entries: InterestingStat[],
  town: TmreTown,
  rotateIndex: number,
  pulseTowns: HomeMarketPulseTown[],
): InterestingStat | null {
  const matched = entries.filter((e) => e.town === town);
  if (matched.length > 0) {
    return matched[rotateIndex % matched.length]!;
  }
  const pulse = pulseTowns.find((t) => t.town === town);
  if (pulse) return townPulseStat(pulse, rotateIndex);
  const marketWide = entries.filter((e) => !e.town);
  if (marketWide.length > 0) {
    return marketWide[rotateIndex % marketWide.length]!;
  }
  if (entries.length > 0) return entries[rotateIndex % entries.length]!;
  return null;
}

/**
 * Homepage primer: educate on the listing score, preview site surfaces,
 * and hand off to this week’s Deal of the Week — atmosphere from that listing.
 */
export default function HomeMethodOverview({
  pulseTowns = [],
}: {
  /** Town pulse rows — used to pair a town metric with the score carousel. */
  pulseTowns?: HomeMarketPulseTown[];
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [samples, setSamples] = useState<ScoreSample[]>([]);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [heroBeat, setHeroBeat] = useState<HeroBeat>("score-in");
  const [interestingEntries, setInterestingEntries] = useState<InterestingStat[]>(
    [],
  );
  /** Freeze outgoing town’s stat while the next town’s score fades in. */
  const [pinnedStat, setPinnedStat] = useState<InterestingStat | null>(null);
  const [heroIsMobile, setHeroIsMobile] = useState(readHeroNarrowViewport);
  const [heroFadeMs, setHeroFadeMs] = useState(() =>
    readHeroNarrowViewport() ? HERO_FADE_MS_MOBILE : HERO_FADE_MS,
  );

  useEffect(() => {
    const mq = window.matchMedia(HERO_NARROW_MQ);
    const sync = () => {
      const narrow = mq.matches;
      setHeroIsMobile(narrow);
      setHeroFadeMs(narrow ? HERO_FADE_MS_MOBILE : HERO_FADE_MS);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Scores first — photo + interesting-stat wait until we have a sample (or the
  // score fetch finished empty) so the hero number is never starved by other APIs.
  useEffect(() => {
    let cancelled = false;
    const seenTowns = new Set<TmreTown>();

    const sampleFromDeal = (
      town: TmreTown,
      deal:
        | {
            score?: { composite?: number };
            listing?: { mlsId?: string; listingKey?: string | null };
          }
        | null
        | undefined,
    ): ScoreSample | null => {
      const score = deal?.score?.composite;
      const mlsId = deal?.listing?.mlsId?.trim();
      if (typeof score !== "number" || !mlsId) return null;
      return {
        town,
        score,
        mlsId,
        listingKey: deal?.listing?.listingKey ?? null,
      };
    };

    const mergeSample = (sample: ScoreSample) => {
      if (cancelled) return;
      seenTowns.add(sample.town);
      setSamples((prev) => {
        if (prev.some((p) => p.town === sample.town)) {
          return prev.map((p) => (p.town === sample.town ? sample : p));
        }
        return [...prev, sample];
      });
    };

    const fetchTownSample = async (town: TmreTown) => {
      try {
        const qs = new URLSearchParams({
          city: town,
          kind: "sale",
          property: "homes",
        });
        const r = await fetch(`/api/deal-of-the-day?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const deal = (await r.json()) as {
          score?: { composite?: number };
          listing?: { mlsId?: string; listingKey?: string | null };
        };
        const sample = sampleFromDeal(town, deal);
        if (sample) mergeSample(sample);
      } catch {
        /* ignore */
      }
    };

    const loadPhoto = () => {
      fetch("/api/deal-of-the-week", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as { photoUrl?: string | null };
        })
        .then((d) => {
          if (cancelled || !d?.photoUrl) return;
          setPhotoUrl(d.photoUrl);
        })
        .catch(() => {});
    };

    const loadInterestingStat = () => {
      fetch("/api/interesting-stat?history=1", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as { entries?: InterestingStat[] };
        })
        .then((d) => {
          if (cancelled || !Array.isArray(d?.entries) || d.entries.length === 0) {
            return;
          }
          const next = d.entries
            .filter((e) => e?.value && e?.detail)
            .map((e) => ({
              eyebrow: e.eyebrow || "Interesting stat",
              value: e.value,
              detail: e.detail,
              href: e.href || "/stats",
              kind: e.kind,
              town: e.town ?? null,
            }));
          if (next.length === 0) return;
          setInterestingEntries(next);
          const warm = next[0]!;
          if (warm.kind) {
            for (const url of interestingStatWarmUrls(
              warm.kind,
              warm.town ?? null,
            )) {
              prefetchTabJson(url);
            }
          } else if (warm.href.startsWith("/stats")) {
            prefetchTabJson("/api/stats/page?kind=sale");
          }
        })
        .catch(() => {});
    };

    void (async () => {
      let gotAny = false;
      try {
        const r = await fetch(
          "/api/deal-of-the-day?bundle=1&kind=sale&property=homes",
          { cache: "no-store" },
        );
        if (r.ok) {
          const payload = (await r.json()) as {
            deals?: Partial<
              Record<
                TmreTown,
                {
                  score?: { composite?: number };
                  listing?: {
                    mlsId?: string;
                    listingKey?: string | null;
                  };
                }
              >
            >;
          };
          const next: ScoreSample[] = [];
          for (const town of TMRE_TOWNS) {
            const sample = sampleFromDeal(town, payload.deals?.[town]);
            if (sample) {
              next.push(sample);
              seenTowns.add(town);
            }
          }
          if (next.length > 0) {
            gotAny = true;
            if (!cancelled) setSamples(next);
            loadPhoto();
            loadInterestingStat();
          }
        }
      } catch {
        /* fall through */
      }

      if (cancelled) return;

      if (!gotAny) {
        let secondaryStarted = false;
        await Promise.all(
          TMRE_TOWNS.map(async (town) => {
            await fetchTownSample(town);
            if (!cancelled && !secondaryStarted && seenTowns.size > 0) {
              secondaryStarted = true;
              loadPhoto();
              loadInterestingStat();
            }
          }),
        );
        if (!cancelled && !secondaryStarted) {
          loadPhoto();
          loadInterestingStat();
        }
      } else {
        const missing = TMRE_TOWNS.filter((town) => !seenTowns.has(town));
        void Promise.all(missing.map((town) => fetchTownSample(town)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep index in range when the sample list grows/shrinks.
  useEffect(() => {
    if (samples.length === 0) {
      setSampleIndex(0);
      setHeroBeat("score-in");
      return;
    }
    setSampleIndex((i) => (i >= samples.length ? 0 : i));
  }, [samples.length]);

  const live = samples[sampleIndex] ?? samples[0] ?? null;
  const interestingStat = live
    ? pickInterestingForTown(
        interestingEntries,
        live.town,
        sampleIndex,
        pulseTowns,
      )
    : interestingEntries[0] ?? null;

  /** Keep the outgoing town’s stat while the next score fades in, then out. */
  const displayStat =
    (heroBeat === "score-in-next" || heroBeat === "stat-out") && pinnedStat
      ? pinnedStat
      : interestingStat;
  const interestingStatRef = useRef(interestingStat);
  interestingStatRef.current = interestingStat;

  // Desktop: score hold → stat in → score out → stat hold → next score in → stat out.
  // Mobile: both stay for one town, then fade together into the next.
  useEffect(() => {
    if (samples.length === 0) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Skip fades when reduced-motion is on, but keep the same dwell as the
    // viewport — otherwise iOS “Reduce Motion” made mobile feel rushed.
    const fadeMs = reduceMotion ? 0 : heroFadeMs;
    const scoreHoldMs = HERO_SCORE_HOLD_MS;
    const statHoldMs = HERO_STAT_HOLD_MS;
    const togetherHoldMs = HERO_TOGETHER_HOLD_MS_MOBILE;

    let cancelled = false;
    let timer: number | null = null;
    const schedule = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const advanceTown = () => {
      setSampleIndex((i) =>
        samples.length <= 1 ? 0 : (i + 1) % samples.length,
      );
    };

    if (heroIsMobile) {
      if (heroBeat === "score-in" || heroBeat === "score-in-next") {
        setPinnedStat(null);
        schedule(Math.max(fadeMs, 40), () => setHeroBeat("score-hold"));
      } else if (
        heroBeat === "score-hold" ||
        heroBeat === "stat-in" ||
        heroBeat === "stat-hold"
      ) {
        schedule(togetherHoldMs, () => setHeroBeat("score-out"));
      } else {
        schedule(Math.max(fadeMs, 40), () => {
          advanceTown();
          setHeroBeat("score-in");
        });
      }
      return () => {
        cancelled = true;
        if (timer != null) window.clearTimeout(timer);
      };
    }

    if (heroBeat === "score-in") {
      setPinnedStat(null);
      schedule(40, () => setHeroBeat("score-hold"));
    } else if (heroBeat === "score-hold") {
      setPinnedStat(null);
      schedule(fadeMs + scoreHoldMs, () => {
        if (interestingStatRef.current) setHeroBeat("stat-in");
        else {
          advanceTown();
          setHeroBeat("score-in");
        }
      });
    } else if (heroBeat === "stat-in") {
      // Stat finishes fading in, then score may leave.
      schedule(fadeMs, () => setHeroBeat("score-out"));
    } else if (heroBeat === "score-out") {
      schedule(fadeMs, () => setHeroBeat("stat-hold"));
    } else if (heroBeat === "stat-hold") {
      schedule(statHoldMs, () => {
        setPinnedStat(interestingStatRef.current);
        advanceTown();
        setHeroBeat("score-in-next");
      });
    } else if (heroBeat === "score-in-next") {
      schedule(fadeMs, () => setHeroBeat("stat-out"));
    } else {
      // stat-out — previous stat gone; land on the new town’s score hold.
      schedule(fadeMs, () => {
        setPinnedStat(null);
        setHeroBeat("score-hold");
      });
    }

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [heroBeat, samples.length, heroFadeMs, heroIsMobile]);

  /** Drive CSS fades: start off, flip on next tick (or the reverse for outs). */
  const [scoreLit, setScoreLit] = useState(true);
  const [statLit, setStatLit] = useState(false);
  useEffect(() => {
    let id: number | null = null;
    if (heroIsMobile) {
      const fadingIn = heroBeat === "score-in" || heroBeat === "score-in-next";
      const fadingOut = heroBeat === "score-out" || heroBeat === "stat-out";
      if (fadingIn) {
        setScoreLit(false);
        setStatLit(false);
        id = window.setTimeout(() => {
          setScoreLit(true);
          setStatLit(true);
        }, 40);
      } else if (fadingOut) {
        setScoreLit(true);
        setStatLit(true);
        id = window.setTimeout(() => {
          setScoreLit(false);
          setStatLit(false);
        }, 40);
      } else {
        setScoreLit(true);
        setStatLit(true);
      }
      return () => {
        if (id != null) window.clearTimeout(id);
      };
    }

    if (heroBeat === "score-in" || heroBeat === "score-in-next") {
      setScoreLit(false);
      id = window.setTimeout(() => setScoreLit(true), 40);
    } else if (heroBeat === "score-hold" || heroBeat === "stat-in") {
      setScoreLit(true);
    } else if (heroBeat === "score-out") {
      setScoreLit(true);
      id = window.setTimeout(() => setScoreLit(false), 40);
    } else if (heroBeat === "stat-hold" || heroBeat === "stat-out") {
      setScoreLit(heroBeat === "stat-out");
    }

    if (heroBeat === "stat-in") {
      setStatLit(false);
      const statId = window.setTimeout(() => setStatLit(true), 40);
      return () => {
        if (id != null) window.clearTimeout(id);
        window.clearTimeout(statId);
      };
    }
    if (
      heroBeat === "score-out" ||
      heroBeat === "stat-hold" ||
      heroBeat === "score-in-next"
    ) {
      setStatLit(true);
    } else if (heroBeat === "stat-out") {
      setStatLit(true);
      const statId = window.setTimeout(() => setStatLit(false), 40);
      return () => {
        if (id != null) window.clearTimeout(id);
        window.clearTimeout(statId);
      };
    } else if (heroBeat === "score-in" || heroBeat === "score-hold") {
      setStatLit(false);
    }

    return () => {
      if (id != null) window.clearTimeout(id);
    };
  }, [heroBeat, heroIsMobile]);

  const scoreOpaque = scoreLit;
  const statOpaque = Boolean(displayStat) && statLit;

  useEffect(() => {
    if (!interestingStat?.kind) return;
    for (const url of interestingStatWarmUrls(
      interestingStat.kind,
      interestingStat.town ?? null,
    )) {
      prefetchTabJson(url);
    }
  }, [interestingStat?.kind, interestingStat?.town, interestingStat?.value]);

  return (
    <section className="relative overflow-x-hidden text-white pt-[5.5rem] pb-6 sm:pt-20 sm:pb-12 lg:pt-24 lg:pb-14">
      {/*
        Atmosphere photo. On mobile the image is locked to 100svh so score / pill /
        interesting-stat reflow (and the iOS URL-bar resize) cannot re-crop
        object-cover — that was the “hopping” background. Below the fold is navy.
        Desktop still fills the whole section.
      */}
      <div className="absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-navy-dark" />
        <div className="absolute inset-x-0 top-0 h-[100svh] overflow-hidden sm:inset-0 sm:h-auto">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              fill
              priority
              unoptimized
              className="object-cover object-center sm:scale-105"
              sizes="100vw"
            />
          ) : (
            <div className="absolute inset-0 navy-gradient" />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-navy-dark/88 via-navy/82 to-navy-dark/92" />
        <div className="absolute inset-0 hero-grid opacity-30" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        {/*
          No frosted card on mobile — copy/score sit on the photo atmosphere
          (same open treatment as desktop). min-w-0 keeps long lines wrapping.
        */}
        <div className="min-w-0">
          <div className="grid min-w-0 items-start gap-4 sm:gap-10 lg:grid-cols-12 lg:gap-8">
            {/* Copy column — lines collapse bottom→top; CTAs rise with the fold */}
            <div className="min-w-0 lg:col-span-6">
              <HomeHeroCopy />

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 animate-fade-up-delay-2 sm:mt-7">
                <Link
                  href="/score"
                  className="font-mono text-[11px] tracking-[0.14em] uppercase text-white/70 transition-colors hover:text-gold"
                >
                  How scoring works
                </Link>
                <Link
                  href="/intelligence"
                  className="inline-flex items-center rounded-lg bg-gold px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-navy-dark transition-colors hover:bg-gold-light"
                >
                  Open Intelligence →
                </Link>
              </div>
            </div>

            {/* Deal of the Day score + matched town interesting-stat */}
            <div className="flex min-w-0 flex-col items-stretch text-left animate-fade-up-delay-1 lg:col-span-6">
              <div className="w-full min-w-0 lg:max-w-none">
                <p className="mb-1 font-mono text-[10px] tracking-[0.2em] uppercase text-gold/80 sm:mb-2 lg:text-left">
                  Actual home · rotating towns
                </p>
                {/*
                  Left (score) / right (stat). Mobile: both stay for the same
                  town, then fade together. Desktop: score hands off to stat.
                */}
                <div className="grid w-full min-w-0 min-h-[11.5rem] grid-cols-2 items-stretch gap-3 sm:min-h-[16.5rem] sm:gap-6 lg:min-h-[18rem] lg:gap-8">
                  <div
                    className={`flex h-full min-h-[11.5rem] w-full min-w-0 flex-col justify-center border-0 bg-transparent px-0.5 py-2 transition-opacity ease-in-out motion-reduce:transition-none sm:min-h-[16.5rem] sm:px-2 lg:min-h-[18rem] lg:px-3 ${
                      scoreOpaque
                        ? "z-10 opacity-100"
                        : "pointer-events-none z-0 opacity-0"
                    }`}
                    style={{ transitionDuration: `${heroFadeMs}ms` }}
                    aria-hidden={!scoreOpaque || undefined}
                  >
                    {live ? (
                      <Link
                        href={dealOfTheDayHref(live.town, {
                          mlsId: live.mlsId,
                          listingKey: live.listingKey,
                          kind: "sale",
                          propertyClass: "homes",
                        })}
                        tabIndex={scoreOpaque ? 0 : -1}
                        className="group block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-dark"
                        aria-label={`Open ${live.town} Deal of the Day, score ${live.score.toFixed(1)}`}
                      >
                        <p
                          key={`${live.town}-${live.score}-${live.mlsId}`}
                          className="font-serif italic gold-shimmer text-[2.65rem] leading-none tracking-tight transition-opacity group-hover:opacity-90 sm:text-[5.5rem] lg:text-[6.5rem]"
                        >
                          {live.score.toFixed(1)}.
                        </p>
                        <p className="mt-1 font-serif italic text-lg text-white/90 transition-colors group-hover:text-gold sm:mt-2 sm:text-3xl">
                          {live.town}
                        </p>
                      </Link>
                    ) : (
                      <>
                        <p className="font-serif italic text-[2.65rem] leading-none tracking-tight text-white/40 sm:text-[5.5rem] lg:text-[6.5rem]">
                          —.—
                        </p>
                        <p className="mt-1 font-serif italic text-lg text-white/90 sm:mt-2 sm:text-3xl">
                          Scanning markets…
                        </p>
                      </>
                    )}
                    <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-white/45 sm:mt-3 sm:text-xs">
                      Today&apos;s pick in each town — tap the score to open that
                      deal. Same yardstick as Deal of the Week.
                    </p>
                  </div>

                  <div
                    className={`flex h-full min-h-[11.5rem] w-full min-w-0 flex-col justify-center border-0 bg-transparent px-0.5 py-2 transition-[opacity,transform] ease-out motion-reduce:transition-none sm:min-h-[16.5rem] sm:px-2 lg:min-h-[18rem] lg:px-3 ${
                      displayStat && statOpaque
                        ? "z-10 translate-y-0 opacity-100"
                        : "pointer-events-none z-0 translate-y-3 opacity-0"
                    }`}
                    style={{ transitionDuration: `${heroFadeMs}ms` }}
                    aria-hidden={!statOpaque || undefined}
                  >
                    {displayStat ? (
                      <Link
                        href={displayStat.href}
                        tabIndex={statOpaque ? 0 : -1}
                        onMouseEnter={() => {
                          if (!displayStat.kind) return;
                          for (const url of interestingStatWarmUrls(
                            displayStat.kind,
                            displayStat.town ?? null,
                          )) {
                            prefetchTabJson(url);
                          }
                        }}
                        className="group/stat block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-dark"
                        title={
                          displayStat.kind === "best-vintage" ||
                          displayStat.kind === "vintage-gap"
                            ? "Learn how scoring works"
                            : "Open this chart on Statistics"
                        }
                      >
                        <span className="block font-mono text-[9px] tracking-[0.2em] uppercase text-gold sm:text-[10px]">
                          {displayStat.eyebrow}
                          {displayStat.town ? (
                            <span className="text-gold/70">
                              {" "}
                              · {displayStat.town}
                            </span>
                          ) : null}
                        </span>
                        <span
                          key={`${displayStat.value}-${displayStat.detail}-${displayStat.town ?? ""}`}
                          className="mt-1.5 block break-words font-serif italic text-xl leading-tight text-white underline decoration-gold/35 underline-offset-4 transition-opacity group-hover/stat:opacity-90 sm:text-[1.85rem] lg:text-[2.35rem]"
                        >
                          {displayStat.value}
                        </span>
                        <span className="mt-1.5 block break-words text-[11px] leading-snug text-white/60 sm:text-xs sm:max-w-sm">
                          {displayStat.detail}
                        </span>
                      </Link>
                    ) : null}
                  </div>
                </div>
                {/*
                  Invisible reserved panel (transparent border/bg) so pill fade
                  in/out never collapses layout — same under score on all sizes.
                */}
                <div className="mt-3 w-full min-w-0 border border-transparent bg-transparent sm:mt-4 lg:mt-5">
                  <HomeObjectivePills />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Surface previews are tall — keep them off the first mobile screen. */}
        <div className="relative mt-6 hidden animate-fade-up-delay-2 sm:mt-12 sm:block lg:mt-16">
          <p className="mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-white/40 sm:mb-4">
            Same measure · different rooms of the site
          </p>

          <HomeSurfaceStage />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-navy-dark/45 px-4 py-3 backdrop-blur-md sm:mt-10 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none lg:mt-12">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2 sm:border-t sm:border-white/10 sm:pt-6">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              This week&rsquo;s one listing
            </p>
            <p className="max-w-md text-sm leading-relaxed text-white/55 sm:text-right">
              The home that cleared the bar — photo above is from that pick.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

type HeroCopyMode = "full" | "collapsing" | "collapsed" | "expanded";

/**
 * Hero body copy: after a read pause, phrases fade out last→first (approx.
 * wrapped visual lines). Collapsed: click “Giving buyers…” to restore.
 */
function HomeHeroCopy() {
  const [mode, setMode] = useState<HeroCopyMode>("full");
  const [fadingIndex, setFadingIndex] = useState(-1);
  /** Phrases with index < visibleThrough still occupy flow (may be mid-fade). */
  const [visibleThrough, setVisibleThrough] = useState<number>(
    HERO_COPY_PHRASES.length,
  );
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  useEffect(() => {
    if (mode !== "full") return;
    if (reduceMotion) {
      const id = window.setTimeout(() => {
        setVisibleThrough(0);
        setMode("collapsed");
      }, Math.min(HERO_COPY_READ_MS, 1_200));
      return () => window.clearTimeout(id);
    }
    const startId = window.setTimeout(
      () => setMode("collapsing"),
      HERO_COPY_READ_MS,
    );
    return () => window.clearTimeout(startId);
  }, [mode, reduceMotion]);

  useEffect(() => {
    if (mode !== "collapsing") return;
    let cancelled = false;
    let timer: number | null = null;

    const fadeNext = (fromIndex: number) => {
      if (cancelled) return;
      if (fromIndex < 0) {
        setFadingIndex(-1);
        setVisibleThrough(0);
        setMode("collapsed");
        return;
      }
      setFadingIndex(fromIndex);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setVisibleThrough(fromIndex);
        setFadingIndex(-1);
        timer = window.setTimeout(
          () => fadeNext(fromIndex - 1),
          HERO_COPY_PHRASE_STAGGER_MS,
        );
      }, HERO_COPY_PHRASE_FADE_MS);
    };

    fadeNext(HERO_COPY_PHRASES.length - 1);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [mode]);

  const showFull =
    mode === "full" || mode === "expanded" || mode === "collapsing";

  return (
    <div className="min-w-0">
      <h1 className="animate-fade-up break-words font-serif text-[1.85rem] leading-[1.12] text-white sm:text-5xl sm:leading-[1.05] lg:text-[3.35rem]">
        Cut through the noise.{" "}
        <span className="italic text-gold-light">One clear score.</span>
      </h1>

      {mode === "collapsed" ? (
        <button
          type="button"
          onClick={() => {
            setVisibleThrough(HERO_COPY_PHRASES.length);
            setFadingIndex(-1);
            setMode("expanded");
          }}
          className="mt-3 max-w-xl text-left text-[0.92rem] leading-relaxed text-white/70 underline decoration-white/30 underline-offset-4 transition-colors hover:text-gold hover:decoration-gold/50 sm:mt-5 sm:text-base lg:text-lg"
        >
          Giving buyers&hellip;
        </button>
      ) : null}

      {showFull
        ? HERO_COPY_PARAS.map((para, paraIndex) => {
            const start = HERO_COPY_PARAS.slice(0, paraIndex).reduce(
              (n, p) => n + p.length,
              0,
            );
            const phrases = para.map((text, i) => {
              const index = start + i;
              return {
                text,
                index,
                inFlow: index < visibleThrough,
                fading: fadingIndex === index,
              };
            });
            const anyVisible = phrases.some((p) => p.inFlow || p.fading);
            if (!anyVisible) return null;
            const isMuted = paraIndex === HERO_COPY_PARAS.length - 1;
            return (
              <p
                key={`para-${paraIndex}`}
                className={`max-w-xl ${
                  paraIndex === 0 ? "mt-3 sm:mt-5" : "mt-3 sm:mt-4"
                } ${
                  isMuted
                    ? "text-sm leading-relaxed text-white/55"
                    : "text-[0.92rem] leading-relaxed text-white/75 sm:text-base lg:text-lg"
                }`}
              >
                {phrases.map((p, i) => {
                  if (!p.inFlow && !p.fading) return null;
                  const opaque = p.inFlow && !p.fading;
                  return (
                    <span
                      key={`${paraIndex}-${i}`}
                      className={`inline transition-opacity ease-out motion-reduce:transition-none ${
                        opaque ? "opacity-100" : "opacity-0"
                      }`}
                      style={{
                        transitionDuration: `${HERO_COPY_PHRASE_FADE_MS}ms`,
                      }}
                    >
                      {p.text}
                      {i < phrases.length - 1 ? " " : null}
                    </span>
                  );
                })}
              </p>
            );
          })
        : null}

      {mode === "expanded" ? (
        <button
          type="button"
          onClick={() => setMode("collapsing")}
          className="mt-2 font-mono text-[10px] tracking-[0.14em] uppercase text-white/45 transition-colors hover:text-gold"
        >
          Collapse
        </button>
      ) : null}
    </div>
  );
}

type SurfacePhase = "teaser" | "in" | "hold" | "out";

/**
 * One primary preview + a faint outgoing card. Teaser copy plays before each
 * fade-in so the next room of the site is announced.
 */
function HomeSurfaceStage() {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<SurfacePhase>("teaser");
  const [cardOpacity, setCardOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  useEffect(() => {
    if (phase === "teaser") {
      setCardOpacity(0);
      return;
    }
    if (phase === "hold") {
      setCardOpacity(1);
      return;
    }
    if (phase === "out") {
      setCardOpacity(0);
      return;
    }
    // "in" — mount at 0, then fade up on the next frame.
    setCardOpacity(0);
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setCardOpacity(1));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [phase, index]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase("hold");
      setCardOpacity(1);
      const id = window.setInterval(() => {
        setPrevIndex(null);
        setIndex((i) => (i + 1) % SURFACES.length);
      }, SURFACE_TEASER_MS + SURFACE_HOLD_MS);
      return () => window.clearInterval(id);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    if (phase === "teaser") {
      schedule(SURFACE_TEASER_MS, () => setPhase("in"));
    } else if (phase === "in") {
      schedule(SURFACE_FADE_MS, () => {
        setPrevIndex(null);
        setPhase("hold");
      });
    } else if (phase === "hold") {
      schedule(SURFACE_HOLD_MS, () => setPhase("out"));
    } else {
      schedule(SURFACE_FADE_MS, () => {
        setPrevIndex(index);
        setIndex((i) => (i + 1) % SURFACES.length);
        setPhase("teaser");
      });
    }

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [phase, index, reduceMotion]);

  const current = SURFACES[index]!;
  const outgoing =
    prevIndex != null && prevIndex !== index ? SURFACES[prevIndex]! : null;
  const showTeaser = phase === "teaser" || phase === "out";
  const showCard = phase !== "teaser" || cardOpacity > 0;

  return (
    <div className="relative mb-6 min-h-[14.5rem] sm:min-h-[16rem]">
      <div
        className="absolute left-0 right-0 top-0 z-20 flex h-10 items-center"
        aria-live="polite"
      >
        <p
          key={`${current.id}-teaser`}
          className={`font-mono text-[11px] sm:text-xs tracking-[0.16em] uppercase text-gold/90 ${
            showTeaser ? "opacity-100 home-surface-teaser" : "opacity-0"
          }`}
        >
          {current.teaser}
        </p>
      </div>

      <div className="relative mt-10 h-[12.5rem] sm:h-[14rem]">
        {outgoing ? (
          <div
            className="home-surface-card absolute left-[8%] sm:left-[18%] top-2 z-10 w-[10.5rem] sm:w-[12.5rem] pointer-events-none"
            style={{
              transform: `rotate(${outgoing.rotate}) scale(0.94)`,
              opacity: 0.32,
            }}
            aria-hidden
          >
            <div className="rounded-xl border border-white/10 bg-navy-dark/80 backdrop-blur-md shadow-lg shadow-black/30 overflow-hidden">
              <SurfacePagePreview id={outgoing.id} name={outgoing.name} />
            </div>
          </div>
        ) : null}

        {showCard ? (
          <Link
            href={current.href}
            className="home-surface-card absolute left-[18%] sm:left-[28%] top-0 z-20 w-[11rem] sm:w-[13rem] group"
            style={{
              transform: `rotate(${current.rotate}) translateY(${
                cardOpacity > 0.5 ? "0" : "0.35rem"
              })`,
              opacity: cardOpacity,
              transition: `opacity ${SURFACE_FADE_MS}ms ease, transform ${SURFACE_FADE_MS}ms ease`,
            }}
            aria-label={`Open ${current.name}`}
          >
            <div className="rounded-xl border border-white/15 bg-navy-dark/90 backdrop-blur-md shadow-xl shadow-black/40 overflow-hidden transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-gold/40">
              <SurfacePagePreview id={current.id} name={current.name} />
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Objective pills — each fades in/out on its own random timer (not as a pack),
 * and each keeps a fixed crooked tilt + vertical offset so the row never looks level.
 */
function HomeObjectivePills() {
  const [visible, setVisible] = useState<boolean[]>(() =>
    FILTER_SIGNALS.map((_, i) => i < PILL_MAX_VISIBLE),
  );

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout> | null> = FILTER_SIGNALS.map(
      () => null,
    );
    let cancelled = false;

    const countVisible = (flags: boolean[]) =>
      flags.reduce((n, on) => n + (on ? 1 : 0), 0);

    const clearTimer = (i: number) => {
      const t = timers[i];
      if (t != null) clearTimeout(t);
      timers[i] = null;
    };

    const schedule = (i: number, fn: () => void, ms: number) => {
      clearTimer(i);
      timers[i] = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const hidePill = (i: number) => {
      setVisible((prev) => {
        if (!prev[i]) return prev;
        if (countVisible(prev) <= PILL_MIN_VISIBLE) {
          // Can't drop below the floor — try again later.
          schedule(
            i,
            () => hidePill(i),
            (1200 + Math.random() * 1800) * PILL_TIME_SCALE,
          );
          return prev;
        }
        const next = [...prev];
        next[i] = false;
        schedule(
          i,
          () => showPill(i),
          (700 + Math.random() * 2200) * PILL_TIME_SCALE,
        );
        return next;
      });
    };

    const showPill = (i: number) => {
      setVisible((prev) => {
        if (prev[i]) return prev;
        if (countVisible(prev) >= PILL_MAX_VISIBLE) {
          schedule(
            i,
            () => showPill(i),
            (900 + Math.random() * 1600) * PILL_TIME_SCALE,
          );
          return prev;
        }
        const next = [...prev];
        next[i] = true;
        schedule(
          i,
          () => hidePill(i),
          (2200 + Math.random() * 3800) * PILL_TIME_SCALE,
        );
        return next;
      });
    };

    // Kick each pill on its own phase so they don’t sync.
    FILTER_SIGNALS.forEach((_, i) => {
      const startVisible = i < PILL_MAX_VISIBLE;
      if (startVisible) {
        schedule(
          i,
          () => hidePill(i),
          (1400 + Math.random() * 3200 + i * 180) * PILL_TIME_SCALE,
        );
      } else {
        schedule(
          i,
          () => showPill(i),
          (800 + Math.random() * 2800 + i * 120) * PILL_TIME_SCALE,
        );
      }
    });

    return () => {
      cancelled = true;
      timers.forEach((t, i) => {
        if (t != null) clearTimeout(t);
        timers[i] = null;
      });
    };
  }, []);

  return (
    <div className="home-objective-pills relative mt-1 flex max-w-3xl min-h-[3.75rem] flex-wrap content-center items-center gap-x-2.5 gap-y-3">
      {FILTER_SIGNALS.map((pill, idx) => {
        if (!visible[idx]) return null;
        return (
          <span
            key={pill.label}
            className="inline-block home-filter-chip-enter"
            style={{
              transform: `rotate(${PILL_TILTS[idx % PILL_TILTS.length]}deg) translateY(${
                PILL_Y[idx % PILL_Y.length]
              }px)`,
              zIndex: 40 - idx,
            }}
          >
            <Link
              href={pill.href}
              className="home-filter-chip inline-flex items-center rounded-full border border-white/20 bg-white/[0.07] px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/75 backdrop-blur-sm transition-colors hover:border-gold/45 hover:text-gold"
            >
              {pill.label}
            </Link>
          </span>
        );
      })}
    </div>
  );
}

/** Miniature page chrome so each card reads as that product surface, not a blank browser. */
function SurfacePagePreview({ id, name }: { id: SurfaceId; name: string }) {
  switch (id) {
    case "intelligence":
      return (
        <div className="bg-[#F5F1E8] text-navy" aria-hidden>
          <div className="bg-gradient-to-br from-[#1C2A3A] to-[#0F1824] px-2.5 pt-2 pb-2">
            <p className="font-mono text-[7px] tracking-[0.16em] uppercase text-[#C8A951]/80">
              Market
            </p>
            <p className="font-serif text-[11px] text-white leading-tight">
              Intelligence{" "}
              <span className="italic text-[#D8BC6E]">board</span>
            </p>
            <div className="mt-1.5 flex gap-1">
              {["All", "Sale", "Zip"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/20 px-1.5 py-0.5 font-mono text-[6px] uppercase text-white/70"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="px-2 py-1.5 space-y-1">
            {[
              { s: "9.1", w: "88%" },
              { s: "8.4", w: "72%" },
              { s: "7.8", w: "64%" },
            ].map((row) => (
              <div
                key={row.s}
                className="flex items-center gap-1.5 rounded-md border border-charcoal/10 bg-white px-1.5 py-1 shadow-sm"
              >
                <span className="font-serif italic text-[10px] text-[#C8A951] w-5 shrink-0">
                  {row.s}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div
                    className="h-1 rounded-full bg-navy/20"
                    style={{ width: row.w }}
                  />
                  <div className="h-0.5 rounded-full bg-navy/10 w-2/3" />
                </div>
              </div>
            ))}
          </div>
          <p className="px-2.5 pb-1.5 font-mono text-[7px] tracking-[0.14em] uppercase text-navy/45">
            {name}
          </p>
        </div>
      );

    case "spotlight":
      return (
        <div className="bg-[#0F1824] text-white" aria-hidden>
          <div className="relative h-[4.25rem] bg-gradient-to-br from-[#3D4F66] via-[#2A3A4D] to-[#1C2A3A]">
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,169,81,0.35),transparent_55%)]" />
            <div className="absolute top-1.5 right-1.5 rounded-md border border-gold/40 bg-navy-dark/70 px-1.5 py-0.5">
              <span className="font-serif italic text-[12px] text-[#D8BC6E]">
                8.7
              </span>
            </div>
            <div className="absolute bottom-1.5 left-2 right-2">
              <p className="font-mono text-[6px] tracking-[0.14em] uppercase text-white/50">
                Featured listing
              </p>
              <p className="font-serif text-[10px] text-white truncate">
                14 Harbor Lane
              </p>
            </div>
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-white/10">
            {["Home", "Photos", "Comps", "If"].map((t, i) => (
              <span
                key={t}
                className={`rounded px-1 py-0.5 font-mono text-[6px] uppercase ${
                  i === 0
                    ? "bg-gold/20 text-gold"
                    : "text-white/40"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="px-2.5 py-1.5 space-y-1">
            <div className="h-1 rounded-full bg-white/15 w-[80%]" />
            <div className="h-1 rounded-full bg-white/10 w-[55%]" />
            <p className="font-mono text-[7px] tracking-[0.14em] uppercase text-white/40 pt-0.5">
              {name}
            </p>
          </div>
        </div>
      );

    case "statistics":
      return (
        <div className="bg-[#F5F1E8] text-navy" aria-hidden>
          <div className="bg-gradient-to-br from-[#1C2A3A] to-[#0F1824] px-2.5 pt-2 pb-1.5">
            <p className="font-serif text-[11px] text-white leading-tight">
              Numbers, <span className="italic text-[#D8BC6E]">live!</span>
            </p>
            <div className="mt-1 flex gap-1">
              {["#38A3C8", "#C8A951", "#E07A5F", "#7BA17B"].map((c) => (
                <span
                  key={c}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="px-2.5 pt-2 pb-1 flex items-end gap-1 h-14">
            {[40, 68, 52, 85, 60, 74, 48].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${h}%`,
                  backgroundColor:
                    ["#38A3C8", "#C8A951", "#E07A5F", "#7BA17B", "#38A3C8", "#C8A951", "#E07A5F"][
                      i
                    ],
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <div className="px-2.5 pb-1.5 space-y-0.5">
            <div className="h-1 rounded-full bg-navy/15 w-full" />
            <div className="h-1 rounded-full bg-navy/10 w-4/5" />
            <p className="font-mono text-[7px] tracking-[0.14em] uppercase text-navy/45 pt-0.5">
              {name}
            </p>
          </div>
        </div>
      );

    case "whatif":
      return (
        <div className="bg-[#0F1824] text-white" aria-hidden>
          <div className="px-2.5 pt-2 pb-1 border-b border-white/10">
            <p className="font-mono text-[7px] tracking-[0.16em] uppercase text-[#C8A951]/80">
              Scenarios
            </p>
            <p className="font-serif text-[11px] text-white leading-tight">
              What <span className="italic text-[#D8BC6E]">if</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 p-2">
            {["Buy", "Sell", "Hold"].map((label, i) => (
              <div
                key={label}
                className="rounded-md border border-white/10 bg-white/[0.04] px-1 py-1.5"
              >
                <p className="font-mono text-[6px] tracking-[0.12em] uppercase text-gold/90">
                  {label}
                </p>
                <p className="mt-0.5 font-serif italic text-[11px] text-white">
                  {["$1.2M", "$1.4M", "7.6"][i]}
                </p>
                <div className="mt-1 h-0.5 rounded-full bg-gold/40 w-3/4" />
              </div>
            ))}
          </div>
          <p className="px-2.5 pb-1.5 font-mono text-[7px] tracking-[0.14em] uppercase text-white/40">
            {name}
          </p>
        </div>
      );
  }
}
