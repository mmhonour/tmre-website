export type GoldilocksFactorKey =
  | "age"
  | "condition"
  | "finishes"
  | "ppsf"
  | "layout"
  | "schools";

/** Client-safe score breakdown shape (shared with API responses). */
export type ScoreBreakdown = {
  age: number;
  condition: number;
  finishesQuality: number;
  pricePerSqftFit: number;
  layoutQuality: number;
  schoolRating: number;
  composite: number;
  weights: {
    age: number;
    condition: number;
    finishes: number;
    ppsf: number;
    layout: number;
    schools: number;
  };
};

export type ScoreExplainTopic =
  | "composite"
  | GoldilocksFactorKey
  | "ppsfVsMedian"
  | "priceReduction";

export const FACTOR_WEIGHTS: Record<GoldilocksFactorKey, number> = {
  age: 0.1,
  condition: 0.2,
  finishes: 0.25,
  ppsf: 0.25,
  layout: 0.1,
  schools: 0.1,
};

export const FACTOR_LABELS: Record<GoldilocksFactorKey, string> = {
  age: "Age",
  condition: "Condition",
  finishes: "Finishes",
  ppsf: "PPSF fit",
  layout: "Layout",
  schools: "Schools",
};

export const FACTOR_DESCRIPTIONS: Record<GoldilocksFactorKey, string> = {
  age: "Rates how new the home is based on year built — newer construction scores higher regardless of finishes.",
  condition:
    "Move-in readiness from listing remarks — renovation language boosts the score; dated or tired-condition signals pull it down.",
  finishes:
    "Signals quality of materials and presentation — granite, hardwood, photo count, and virtual tour availability.",
  ppsf:
    "Measures whether price-per-sqft sits in the Goldilocks zone versus the city median — not too cheap, not overpriced.",
  layout:
    "Bed/bath fit, square footage per bedroom, and layout keywords like open floor plan or master suite.",
  schools:
    "Elementary, middle, and high school ratings for the listing, with a town baseline when school names are missing.",
};

export function factorContribution(factorScore: number, weight: number): number {
  return Math.round(factorScore * weight * 10) / 10;
}

export function buildFactorExplain(
  key: GoldilocksFactorKey,
  factorScore: number,
  weight: number,
): { title: string; lines: string[] } {
  const label = FACTOR_LABELS[key];
  const pct = Math.round(weight * 100);
  const contribution = factorContribution(factorScore, weight);
  return {
    title: label,
    lines: [
      `This listing scores ${Math.round(factorScore)}/100 on ${label.toLowerCase()}.`,
      `${pct}% of the composite Goldilocks score comes from this factor — it adds about ${contribution.toFixed(1)} points toward the total out of 100.`,
      FACTOR_DESCRIPTIONS[key],
    ],
  };
}

export function buildCompositeExplain(composite: number): { title: string; lines: string[] } {
  return {
    title: "Goldilocks composite",
    lines: [
      `${composite.toFixed(1)}/100 is the weighted sum of six factors: age (10%), condition (20%), finishes (25%), PPSF fit (25%), layout (10%), and schools (10%).`,
      "Each factor is scored 0–100 on its own, then multiplied by its weight and added together.",
      "Scores above 85 are exceptional picks; 70–84 are strong; below 70 still qualify but with more trade-offs.",
    ],
  };
}

export function buildPpsfVsMedianExplain(
  ppsfDiscount: number,
  isRental: boolean,
): { title: string; lines: string[] } {
  const unit = isRental ? "rent per sqft" : "price per sqft";
  const direction =
    ppsfDiscount < 0
      ? `${Math.abs(ppsfDiscount)}% below`
      : ppsfDiscount > 0
        ? `${ppsfDiscount}% above`
        : "at";
  return {
    title: "vs city median",
    lines: [
      `This listing's ${unit} is ${direction} the local median for similar ${isRental ? "rentals" : "sales"}.`,
      "PPSF fit is 25% of the Goldilocks composite. The model rewards listings in the 80–90% of median band — enough discount to feel like value, not so cheap that something is wrong.",
      "This market comparison is separate from the factor score bar above, but feeds directly into the PPSF fit score.",
    ],
  };
}

export function buildPriceReductionExplain(reductionPct: number): { title: string; lines: string[] } {
  return {
    title: "Price reduction",
    lines: [
      `The list price is ${reductionPct}% below the original ask — a signal the seller may be motivated.`,
      "Goldilocks does not add this cut as a separate line item, but lower effective pricing often improves PPSF fit (25% of the composite).",
      "A meaningful reduction can push a listing into the value band buyers actively shop.",
    ],
  };
}

export function resolveExplainContent(
  topic: ScoreExplainTopic,
  ctx: {
    composite?: number;
    factorScore?: number;
    weight?: number;
    ppsfDiscount?: number;
    reductionPct?: number;
    isRental?: boolean;
  },
): { title: string; lines: string[] } {
  if (topic === "composite" && ctx.composite != null) {
    return buildCompositeExplain(ctx.composite);
  }
  if (topic === "ppsfVsMedian" && ctx.ppsfDiscount != null) {
    return buildPpsfVsMedianExplain(ctx.ppsfDiscount, ctx.isRental ?? false);
  }
  if (topic === "priceReduction" && ctx.reductionPct != null) {
    return buildPriceReductionExplain(ctx.reductionPct);
  }
  if (
    topic !== "composite" &&
    topic !== "ppsfVsMedian" &&
    topic !== "priceReduction" &&
    ctx.factorScore != null &&
    ctx.weight != null
  ) {
    return buildFactorExplain(topic, ctx.factorScore, ctx.weight);
  }
  return { title: "Score detail", lines: ["No detail available for this statistic."] };
}
