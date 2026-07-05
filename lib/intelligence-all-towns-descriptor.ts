import { createHash } from "node:crypto";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";
import {
  allTownMarketTaglines,
  townMarketTagline,
} from "@/lib/intelligence-town-taglines";

export const MAX_ALL_TOWNS_DESCRIPTOR_WORDS = 5;

export type TownDescriptorStats = {
  town: string;
  listingCount: number;
  medianPrice: number | null;
  medianDom: number | null;
  monthsSupply: number | null;
  newThisWeek: number;
  reduced: number;
  closedThisWeek: number;
  medianSqft: number | null;
};

export type TownMarketPhrase = {
  town: string;
  phrase: string;
};

export type AllTownsDescriptorRequest = {
  towns: TownDescriptorStats[];
  townPhrases: TownMarketPhrase[];
  totalListings: number;
  aggregateMonthsSupply: number | null;
  filterContext: {
    tx: string;
    cls: string;
    saleProperty: string;
    minBedrooms: number;
    minBathrooms: number;
    exactBeds: boolean;
    newConstructionOnly: boolean;
    minPrice?: number;
    maxPrice?: number | null;
  };
};

export type AllTownsDescriptorResponse = {
  descriptor: string;
  source: "ai" | "computed";
  cached?: boolean;
};

const SUMMARY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "also",
  "be",
  "can",
  "county",
  "fairfield",
  "known",
  "or",
  "the",
]);

const TOWN_NAME_TOKENS = new Set(
  TMRE_TOWNS.flatMap((town) => town.toLowerCase().split(/\s+/)),
);

export function descriptorContainsTownName(text: string): boolean {
  const lower = text.toLowerCase();
  return TMRE_TOWNS.some((town) => lower.includes(town.toLowerCase()));
}

/** Enforce a short, stat-free phrase (max 5 words, no town names). */
export function normalizeAllTownsDescriptor(raw: string): string | null {
  const text = raw.trim().replace(/[.,!?;:—–-]+$/g, "").trim();
  if (!text || /[\d$%]/.test(text)) return null;
  if (descriptorContainsTownName(text)) return null;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  return words.slice(0, MAX_ALL_TOWNS_DESCRIPTOR_WORDS).join(" ");
}

export function townPhrasesForDescriptor(
  towns: TownDescriptorStats[],
): TownMarketPhrase[] {
  const listed = towns.map((town) => town.town).filter(Boolean);
  if (listed.length === 0) return allTownMarketTaglines();

  return listed.map((town) => {
    const known = (TMRE_TOWNS as readonly string[]).includes(town)
      ? townMarketTagline(town as TmreTown)
      : town;
    return { town, phrase: known };
  });
}

export function allTownsDescriptorCacheKey(payload: AllTownsDescriptorRequest): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildAllTownsDescriptorRequest(
  towns: TownDescriptorStats[],
  aggregateMonthsSupply: number | null,
  filterContext: AllTownsDescriptorRequest["filterContext"],
): AllTownsDescriptorRequest {
  return {
    towns,
    townPhrases: townPhrasesForDescriptor(towns),
    totalListings: towns.reduce((sum, town) => sum + town.listingCount, 0),
    aggregateMonthsSupply,
    filterContext,
  };
}

function tokenizeDescriptorPhrase(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[\s,—–\-]+/)
    .map((word) => word.replace(/[^a-z]/g, ""))
    .filter(
      (word) =>
        word.length > 2 &&
        !SUMMARY_STOP_WORDS.has(word) &&
        !TOWN_NAME_TOKENS.has(word),
    );
}

/** Summarize per-town market phrases — no town names or stats. */
export function synthesizeAllTownsDescriptorFallback(
  payload: AllTownsDescriptorRequest,
): string {
  const phrases = payload.townPhrases.map((entry) => entry.phrase).filter(Boolean);
  if (phrases.length === 0) {
    return "Premium upscale market mix";
  }

  const freq = new Map<string, number>();
  for (const phrase of phrases) {
    for (const word of tokenizeDescriptorPhrase(phrase)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  const ranked = [...freq.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const picked = ranked
    .slice(0, MAX_ALL_TOWNS_DESCRIPTOR_WORDS)
    .map(([word]) => word);

  if (picked.length === 0) {
    return "Premium upscale market mix";
  }

  const phrase = picked
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");

  return normalizeAllTownsDescriptor(phrase) ?? "Premium upscale market mix";
}

export async function generateAllTownsDescriptorWithAI(
  payload: AllTownsDescriptorRequest,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.OPENAI_DESCRIPTOR_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    "gpt-4o-mini";

  const filterBits = [
    payload.filterContext.tx !== "all" ? payload.filterContext.tx : null,
    payload.filterContext.cls !== "all" ? payload.filterContext.cls : null,
    payload.filterContext.saleProperty !== "all"
      ? payload.filterContext.saleProperty
      : null,
    payload.filterContext.newConstructionOnly ? "new construction" : null,
    payload.filterContext.minBedrooms > 0 ? "bedrooms filtered" : null,
    payload.filterContext.minBathrooms > 0 ? "bathrooms filtered" : null,
    payload.filterContext.minPrice && payload.filterContext.minPrice > 0
      ? "price filtered"
      : null,
    payload.filterContext.maxPrice != null ? "price filtered" : null,
  ].filter(Boolean);

  const townDescriptors = payload.townPhrases.map((entry) => entry.phrase);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      max_tokens: 24,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Write one phrase of five words or fewer that succinctly summarizes the combined meaning of the supplied per-town market descriptors for a Connecticut Fairfield County dashboard. Never use any town, city, or place names. Never use numbers, prices, percentages, counts, or other statistics. No punctuation except spaces. Return JSON: {"descriptor":"..."}',
        },
        {
          role: "user",
          content: JSON.stringify({
            region: "Fairfield County, CT — TMRE coverage",
            filters: filterBits.length ? filterBits : ["none"],
            townDescriptors,
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    console.error(
      "[all-towns-descriptor] OpenAI error",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = body.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { descriptor?: string };
    const descriptor = parsed.descriptor?.trim();
    return descriptor ? normalizeAllTownsDescriptor(descriptor) : null;
  } catch {
    return null;
  }
}

const serverCache = new Map<string, { descriptor: string; expires: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function resolveAllTownsDescriptor(
  payload: AllTownsDescriptorRequest,
): Promise<AllTownsDescriptorResponse> {
  const key = allTownsDescriptorCacheKey(payload);
  const hit = serverCache.get(key);
  if (hit && hit.expires > Date.now()) {
    const cached = normalizeAllTownsDescriptor(hit.descriptor);
    if (cached) {
      return { descriptor: cached, source: "ai", cached: true };
    }
    serverCache.delete(key);
  }

  const ai = await generateAllTownsDescriptorWithAI(payload);
  if (ai) {
    serverCache.set(key, { descriptor: ai, expires: Date.now() + CACHE_TTL_MS });
    return { descriptor: ai, source: "ai" };
  }

  return {
    descriptor: synthesizeAllTownsDescriptorFallback(payload),
    source: "computed",
  };
}
