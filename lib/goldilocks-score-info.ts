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

/** Built-in defaults — live weights live in Postgres (`goldilocks_scoring_config`). */
export { DEFAULT_GOLDILOCKS_WEIGHTS as FACTOR_WEIGHTS } from "@/lib/goldilocks-config-shared";

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
    "How move-in ready the home sounds — fresh new construction (built within ~12 months, never occupied/resold) defaults to 100 unless remarks mention dated finishes or distress; otherwise renovation language in the remarks helps and tired-finish language pulls the score down.",
  finishes:
    "Quality of materials and how well the listing shows them — granite, hardwood, and similar details in the remarks, plus whether photos actually show updates and layout clearly.",
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
  options?: { showWeight?: boolean },
): { title: string; lines: string[] } {
  const label = FACTOR_LABELS[key];
  const lines = [
    `This listing scores ${Math.round(factorScore)}/100 on ${label.toLowerCase()}.`,
    FACTOR_DESCRIPTIONS[key],
  ];
  if (options?.showWeight && weight > 0) {
    const pct = Math.round(weight * 100);
    const contribution = factorContribution(factorScore, weight);
    lines.push(
      `Admin: this factor is weighted ${pct}% of the composite (≈ ${contribution.toFixed(1)} points toward the total).`,
    );
  }
  return {
    title: label,
    lines,
  };
}

export function buildCompositeExplain(composite: number): { title: string; lines: string[] } {
  return {
    title: "Goldilocks composite",
    lines: [
      `${composite.toFixed(1)}/100 summarizes how this listing ranks on age, condition, finishes, PPSF fit, layout, and schools.`,
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
      "PPSF fit rewards listings in the 80–90% of median band — enough discount to feel like value, not so cheap that something is wrong.",
      "This market comparison is separate from the factor score bar above, but feeds directly into the PPSF fit score.",
    ],
  };
}

export function buildPriceReductionExplain(reductionPct: number): { title: string; lines: string[] } {
  return {
    title: "Price reduction",
    lines: [
      `The list price is ${reductionPct}% below the original ask — a signal the seller may be motivated.`,
      "Goldilocks does not add this cut as a separate line item, but lower effective pricing often improves PPSF fit.",
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
    showWeights?: boolean;
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
    return buildFactorExplain(topic, ctx.factorScore, ctx.weight, {
      showWeight: ctx.showWeights === true,
    });
  }
  return { title: "Score detail", lines: ["No detail available for this statistic."] };
}
