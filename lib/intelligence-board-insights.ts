/** Pre-computed deal-board insight headlines (Intelligence page). */

export type IntelligenceBoardInsightStatus = 'Active' | 'Pending' | 'New' | 'Reduced'

export type IntelligenceBoardInsightListing = {
  key: string
  address: string
  propertyType: string
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  dom: number | null
  status: IntelligenceBoardInsightStatus
  isRental: boolean
  isCommercial: boolean
  zip: string | null
  price: number
  score: number
  headline?: string
}

type InsightCandidate = {
  phrase: string
  family: string
}

type InsightInput = {
  address: string;
  propertyType: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  status: IntelligenceBoardInsightStatus;
  isRental: boolean;
  isCommercial: boolean;
  zip: string | null;
  price: number;
  score: number;
};

function streetCue(address: string): string | null {
  const cleaned = address.replace(/^\d+\s*/, "").trim();
  if (!cleaned) return null;
  const withoutSuffix = cleaned.replace(
    /\s+(Dr|Rd|St|Ave|Ln|Ct|Pl|Tpke|Hwy|Hill|Ridge|Beach|Way|Cir|Ter|Blvd)\.?$/i,
    "",
  );
  const words = withoutSuffix.split(/\s+/).slice(0, 2);
  return words.length ? words.join(" ") : cleaned.split(/\s+/)[0] ?? null;
}

function formatCompactSqft(sqft: number): string {
  if (sqft >= 1000) return `${(sqft / 1000).toFixed(1).replace(/\.0$/, "")}K sqft`;
  return `${sqft.toLocaleString()} sqft`;
}

function generateInsightCandidates(input: InsightInput): InsightCandidate[] {
  const {
    address,
    propertyType,
    beds,
    baths,
    sqft,
    yearBuilt,
    dom,
    status,
    isRental,
    isCommercial,
    zip,
    price,
    score,
  } = input;
  const street = streetCue(address);
  const isMulti = /multi/i.test(propertyType);
  const isCondo = /condo|co-op/i.test(propertyType);
  const isNewBuild = yearBuilt != null && yearBuilt >= 2020;
  const isRecentBuild = yearBuilt != null && yearBuilt >= 2015;
  const isVintage = yearBuilt != null && yearBuilt <= 1940;
  const layout =
    beds != null && baths != null ? `${beds}bd/${baths}ba` : beds != null ? `${beds}-bed` : null;
  const candidates: InsightCandidate[] = [];
  const seenPhrases = new Set<string>();

  // Each call passes alternating (family, phrase) pairs.
  const push = (...entries: (string | null | undefined)[]) => {
    for (let i = 0; i + 1 < entries.length; i += 2) {
      const family = entries[i];
      const phrase = entries[i + 1];
      if (family && phrase && !seenPhrases.has(phrase)) {
        seenPhrases.add(phrase);
        candidates.push({ phrase, family });
      }
    }
  };

  if (status === "Reduced") {
    push(
      "price-reduced-reset",
      street ? `Price reset on ${street} — seller re-engaging` : "Price reset — motivated seller signal",
      "price-reduced-ask",
      street ? `Reduced ask on ${street}` : "Fresh price cut — worth a second look",
      "price-reduced-traction",
      layout && street ? `${layout} on ${street} · newly priced` : "Re-priced for faster traction",
      "price-reduced-signal",
      layout && zip ? `${layout} · price just adjusted in ${zip}` : "Seller signal — fresh price adjustment",
    );
  }

  if (dom != null && dom <= 3) {
    push(
      "fresh-listed-timing",
      dom === 0 ? "Listed today — earliest look" : `Listed ${dom} day${dom === 1 ? "" : "s"} ago — still fresh`,
      "fresh-listed-street",
      street ? `New to market on ${street}` : "Just hit the market — fresh listing",
      "fresh-listed-zip",
      zip ? `Fresh ${zip} listing` : null,
      "fresh-listed-window",
      dom != null && dom <= 1 ? "First-look window — still early" : "Early days on market",
    );
  }

  if (isNewBuild && !isRental) {
    push(
      "new-build-year",
      yearBuilt && street ? `${yearBuilt} build on ${street}` : yearBuilt ? `${yearBuilt} new construction` : null,
      "new-build-layout",
      layout && yearBuilt ? `${layout} · ${yearBuilt} build` : null,
      "new-build-ready",
      street ? `Move-in ready new build on ${street}` : "New construction with modern finishes",
      "new-build-sqft",
      sqft ? `New build · ${formatCompactSqft(sqft)}` : null,
      "new-build-zip",
      yearBuilt && zip ? `${yearBuilt} delivery in ${zip}` : null,
      "new-build-modern",
      sqft && zip ? `Modern ${formatCompactSqft(sqft)} in ${zip}` : "Current-era build — minimal deferred maintenance",
    );
  }

  if (isNewBuild && isRental) {
    push(
      "rental-new-build",
      yearBuilt && street ? `${yearBuilt} rental on ${street}` : "Modern build · turn-key rental",
      "rental-designer",
      layout && street ? `${layout} lease on ${street}` : "Designer finishes · rental ready",
    );
  }

  if (isMulti && !isRental) {
    push(
      "multi-income",
      street ? `Income-producing units on ${street}` : "Multi-family with income-producing units",
      "multi-house-hack",
      layout && street ? `${layout} multi on ${street}` : "House-hack or investor-friendly layout",
      "multi-cashflow",
      zip ? `Multi-unit cash-flow play in ${zip}` : "Multi-unit with rental upside",
    );
  }

  if (sqft != null && sqft >= 4500) {
    push(
      "estate-scale",
      street ? `Estate-scale living on ${street}` : "Grand scale with exceptional living space",
      "estate-footprint",
      `${formatCompactSqft(sqft)}${layout ? ` · ${layout}` : ""}`,
      "estate-volume",
      street ? `${formatCompactSqft(sqft)} footprint on ${street}` : null,
      "estate-compound",
      "Private-compound proportions — room to spread out",
      "estate-rare-scale",
      zip ? `Rare ${formatCompactSqft(sqft)} for ${zip}` : "Rare scale for the neighborhood",
      "estate-expansive",
      layout ? `Expansive ${layout} · ${formatCompactSqft(sqft)}` : `Expansive ${formatCompactSqft(sqft)} layout`,
      "estate-wing",
      "Room for guest wing, office, or gym",
    );
  } else if (sqft != null && sqft >= 3500) {
    push(
      "oversized-layout",
      street ? `Oversized ${formatCompactSqft(sqft)} on ${street}` : "Oversized layout, rare for the street",
      "oversized-generous",
      layout && street ? `${layout} · generous ${formatCompactSqft(sqft)}` : null,
      "oversized-spread",
      zip ? `${formatCompactSqft(sqft)} with space to spread out · ${zip}` : "Above-average footprint for the area",
      "oversized-family",
      layout ? `Family-scale ${layout} · ${formatCompactSqft(sqft)}` : `Generous ${formatCompactSqft(sqft)} floor plan`,
    );
  } else if (sqft != null && sqft >= 2500) {
    push(
      "generous-layout",
      street ? `Room to spread out on ${street}` : "Generously proportioned throughout",
      "generous-sqft",
      `${formatCompactSqft(sqft)}${zip ? ` in ${zip}` : ""}`,
      "generous-flow",
      layout && street ? `${layout} with easy flow on ${street}` : "Open flow — more space than typical",
      "generous-comfort",
      zip ? `Comfortably sized for ${zip}` : "Comfortably sized for everyday living",
    );
  }

  if (isRecentBuild && !isNewBuild) {
    push(
      "recent-contemporary",
      yearBuilt && street ? `${yearBuilt} contemporary on ${street}` : "Contemporary design, recently updated",
      "recent-updates",
      yearBuilt && layout ? `${yearBuilt} ${layout} with modern updates` : null,
      "recent-turnkey",
      yearBuilt && zip ? `${yearBuilt} turn-key in ${zip}` : "Recent vintage with modern systems",
    );
  }

  if (beds != null && beds >= 5) {
    push(
      "five-bed-rare",
      street ? `Rare five-bed layout on ${street}` : "Rare five-bedroom layout",
      "five-bed-uncommon",
      layout && zip ? `${layout} · uncommon for ${zip}` : null,
      "five-bed-scale",
      sqft ? `Five-bedroom scale · ${formatCompactSqft(sqft)}` : "Five-bedroom scale — hard to find",
    );
  } else if (beds != null && beds >= 4) {
    push(
      "four-bed-family",
      street ? `Family-sized ${layout} on ${street}` : "Four-bedroom layout, ideal for families",
      "four-bed-sqft",
      layout && sqft ? `${layout} · ${formatCompactSqft(sqft)}` : null,
      "four-bed-flex",
      zip ? `${layout ?? "Four-bed"} with flex space · ${zip}` : "Four-bed with flex space",
    );
  }

  if (isCondo) {
    push(
      "condo-low-maint",
      street ? `Low-maintenance condo on ${street}` : "Low-maintenance living in prime location",
      "condo-lock-leave",
      zip ? `Lock-and-leave living in ${zip}` : null,
      "condo-amenity",
      layout ? `${layout} condo — minimal upkeep` : "Condo ease — minimal upkeep",
    );
  }

  if (isVintage) {
    push(
      "vintage-character",
      yearBuilt && street ? `${yearBuilt} character home on ${street}` : "Classic character with thoughtful updates",
      "vintage-detail",
      yearBuilt && layout ? `${yearBuilt} ${layout} with original detail` : null,
      "vintage-charm",
      yearBuilt && zip ? `${yearBuilt} charm in ${zip}` : "Period detail with livable updates",
    );
  }

  if (isRental && sqft != null && sqft >= 2200) {
    push(
      "rental-spacious",
      street ? `Spacious rental on ${street}` : "Exceptionally spacious for the neighborhood",
      "rental-lease-zip",
      layout && zip ? `${layout} lease · ${zip}` : null,
    );
  }

  if (isRental) {
    push(
      "rental-turnkey",
      street ? `Turn-key rental on ${street}` : "Turn-key rental in high-demand corridor",
      "rental-lease",
      zip ? `Lease opportunity in ${zip}` : null,
      "rental-demand",
      layout && zip ? `${layout} rental demand · ${zip}` : "Strong rental demand corridor",
    );
  }

  if (isCommercial) {
    push(
      "commercial-opportunity",
      street ? `Commercial opportunity on ${street}` : "Commercial footprint with operator upside",
      "commercial-ready",
      zip ? `Business-ready space in ${zip}` : null,
    );
  }

  if (dom != null && dom <= 14) {
    push(
      "demand-block",
      street ? `High-demand block — ${street}` : "High-demand street — rarely available",
      "demand-scarce",
      zip ? `Scarce inventory in ${zip}` : null,
      "demand-velocity",
      dom <= 7 ? "Fast-moving segment — limited supply" : "Active buyer interest in this pocket",
    );
  }

  if (score >= 85) {
    push(
      "top-scored",
      street ? `Top-scored pick on ${street}` : "Top-scored against the deal model",
      "top-scored-layout",
      layout && street ? `Strong ${layout} fit on ${street}` : null,
      "top-scored-signal",
      zip ? `Top-tier score signal · ${zip}` : "Top-tier score against peers",
    );
  }

  if (price >= 2_000_000) {
    push(
      "trophy-price",
      street ? `Trophy-tier ask on ${street}` : "Trophy-tier price point",
      "trophy-segment",
      zip ? `Trophy segment listing · ${zip}` : "Upper-tier market positioning",
    );
  } else if (price >= 1_000_000) {
    push(
      "premium-price",
      street ? `Premium ${zip ?? "town"} positioning on ${street}` : "Premium market positioning",
      "premium-band",
      layout && zip ? `${layout} in the premium ${zip} band` : "Premium price band for the area",
    );
  }

  push(
    "standout-inventory",
    street ? `Standout inventory on ${street}` : null,
    "standout-layout",
    layout && street ? `${layout} opportunity on ${street}` : null,
    "standout-zip-signal",
    zip && street ? `${street} · ${zip} value signal` : null,
    "standout-layout-zip",
    layout && zip ? `${layout} in ${zip}` : null,
    "standout-street",
    street ? `${street} — worth a closer look` : null,
    "standout-zip",
    zip ? `Notable ${zip} listing` : null,
    "standout-class",
    "Standout pick in its class",
  );

  return candidates;
}

function generateSecondaryInsightCandidates(input: InsightInput): InsightCandidate[] {
  const street = streetCue(input.address);
  const layout =
    input.beds != null && input.baths != null
      ? `${input.beds}bd/${input.baths}ba`
      : input.beds != null
        ? `${input.beds}-bed`
        : null;
  const sqftLabel = input.sqft != null ? formatCompactSqft(input.sqft) : null;

  const push = (family: string, phrase: string | null | undefined): InsightCandidate | null => {
    if (!phrase) return null;
    return { phrase, family: `secondary-${family}` };
  };

  return [
    push("address-zip", input.zip ? `${input.address} · ${input.zip}` : null),
    push("layout-price", layout && input.price ? `${layout} · $${input.price.toLocaleString()}` : null),
    push("sqft-dom", sqftLabel && input.dom != null ? `${sqftLabel} · ${input.dom}d on market` : null),
    push("score-street", street ? `Score ${input.score.toFixed(0)} pick · ${street}` : null),
    push("street-sqft", street && sqftLabel ? `${street} · ${sqftLabel}` : null),
    push("zip-score", input.zip ? `${input.zip} · score ${input.score.toFixed(0)}` : null),
    push("dom-street", street && input.dom != null ? `${input.dom}d on market · ${street}` : null),
    push(
      "price-sqft",
      sqftLabel && input.sqft
        ? `$${Math.round(input.price / input.sqft).toLocaleString()}/sqft effective · ${sqftLabel}`
        : null,
    ),
  ].filter((c): c is InsightCandidate => c != null);
}

function insightHeadline(value: string | InsightCandidate): string {
  return typeof value === "string" ? value : value.phrase;
}

function pickUniqueInsight(
  input: InsightInput,
  usedPhrases: Set<string> = new Set(),
  usedFamilies: Set<string> = new Set(),
): string {
  const street = streetCue(input.address);
  const candidates = generateInsightCandidates(input);

  const claim = (phrase: string, family: string): string => {
    usedPhrases.add(phrase);
    usedFamilies.add(family);
    return phrase;
  };

  for (const { phrase, family } of candidates) {
    if (!usedPhrases.has(phrase) && !usedFamilies.has(family)) {
      return claim(phrase, family);
    }
  }

  for (const { phrase, family } of candidates) {
    if (!usedPhrases.has(phrase)) {
      return claim(phrase, family);
    }
  }

  const augmentations = [
    street,
    input.zip,
    input.beds != null ? `${input.beds}-bed` : null,
    input.sqft != null ? formatCompactSqft(input.sqft) : null,
    input.yearBuilt != null ? `built ${input.yearBuilt}` : null,
    input.dom != null ? `${input.dom}d DOM` : null,
    `$${input.price.toLocaleString()}`,
  ].filter(Boolean) as string[];

  for (const { phrase, family } of candidates) {
    for (const tag of augmentations) {
      const variant = `${phrase} · ${tag}`;
      if (!usedPhrases.has(variant)) {
        return claim(variant, `${family}-tagged`);
      }
    }
  }

  for (const { phrase, family } of generateSecondaryInsightCandidates(input)) {
    if (!usedPhrases.has(phrase) && !usedFamilies.has(family)) {
      return claim(phrase, family);
    }
  }

  for (const { phrase, family } of generateSecondaryInsightCandidates(input)) {
    if (!usedPhrases.has(phrase)) {
      return claim(phrase, family);
    }
  }

  let fallback = street
    ? `${street} — ${input.address}`
    : input.zip
      ? `${input.address} · ${input.zip}`
      : input.address;
  let suffix = 2;
  while (usedPhrases.has(fallback)) {
    fallback = `${input.address} · insight ${suffix}`;
    suffix += 1;
  }
  return claim(fallback, "fallback-address");
}
function insightInputFromBoardListing(l: IntelligenceBoardInsightListing): InsightInput {
  return {
    address: l.address,
    propertyType: l.propertyType,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt,
    dom: l.dom,
    status: l.status,
    isRental: l.isRental,
    isCommercial: l.isCommercial,
    zip: l.zip,
    price: l.price,
    score: l.score,
  }
}

/** Assign unique insight headlines per town board (score order). */
export function attachIntelligenceBoardInsights<T extends IntelligenceBoardInsightListing>(
  listings: readonly T[],
): Array<T & { headline: string }> {
  const usedPhrases = new Set<string>()
  const usedFamilies = new Set<string>()
  const ordered = [...listings].sort((a, b) => b.score - a.score)
  const headlines = new Map<string, string>()
  for (const listing of ordered) {
    headlines.set(
      listing.key,
      pickUniqueInsight(insightInputFromBoardListing(listing), usedPhrases, usedFamilies),
    )
  }
  return listings.map((listing) => ({
    ...listing,
    headline: headlines.get(listing.key) ?? listing.headline ?? '',
  }))
}
