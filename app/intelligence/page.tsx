import { Suspense } from "react";
import IntelligenceClient from "@/components/IntelligenceClient";
import { SITE_URL } from "@/lib/business-info";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import { getIntelligenceDescriptorSizesFresh } from "@/lib/intelligence-descriptor-sizes-config";
import { loadInventorySegmentChartSeed } from "@/lib/intelligence-inventory-segment-fssr";
import {
  buildIntelligenceShareDescription,
  buildIntelligenceShareHref,
  buildIntelligenceShareTitle,
  intelligenceShareStateFromParsed,
  parseIntelligenceSearchParams,
} from "@/lib/intelligence-search-url";

type IntelligenceSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function toUrlSearchParams(
  raw: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
    } else if (value) {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Per-filter title + OG tags. String formatting only — no DB.
 * The page is already dynamic (root layout awaits cookies()), so this
 * does not move Intelligence off a cache it currently has.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: IntelligenceSearchParams;
}) {
  const parsed = parseIntelligenceSearchParams(
    toUrlSearchParams(await searchParams),
  );
  const state = parsed
    ? intelligenceShareStateFromParsed(parsed)
    : { city: "All" };
  const title = buildIntelligenceShareTitle(state);
  const description = buildIntelligenceShareDescription(state);
  const path = buildIntelligenceShareHref(state);
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function IntelligencePage() {
  const [seed, inventorySeed, descriptorSizes] = await Promise.all([
    loadDealOfTheDayFssrSeed("sale", "homes"),
    loadInventorySegmentChartSeed("All"),
    getIntelligenceDescriptorSizesFresh(),
  ]);

  return (
    <Suspense fallback={null}>
      <IntelligenceClient
        initialDotdDealsByTown={seed?.dealsByTown ?? null}
        initialInventorySegmentChart={inventorySeed}
        initialDescriptorSizes={descriptorSizes}
      />
    </Suspense>
  );
}
