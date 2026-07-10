import {
  classifyYearBuilt,
  VINTAGE_BUCKETS,
  type VintageBucketId,
} from "@/lib/vintage-buckets";

export type VintageSnapshotValueSignal = "normal" | "good" | "bad";

export type VintageSnapshotMetric = {
  label: string;
  value: string;
  trend: string;
  valueSignal?: VintageSnapshotValueSignal;
};

export type VintageBucketSnapshot = {
  id: VintageBucketId;
  label: string;
  metrics: VintageSnapshotMetric[];
};

export type VintageListingRow = {
  price: number;
  dom: number | null;
  pricePerSqft: number | null;
  sqft: number | null;
  beds: number | null;
  status: string;
  isRental: boolean;
  isCommercial: boolean;
  yearBuilt?: number | null;
};

export type VintageSnapshotBenchmarks = {
  medianPrice: number | null;
  avgPpsf: number | null;
  medianSqft: number | null;
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
}

function formatSnapshotPrice(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function formatSnapshotSqft(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

function formatAvgBedrooms(avg: number | null): string {
  if (avg == null || !Number.isFinite(avg) || avg <= 0) return "—";
  const low = Math.floor(avg);
  const high = Math.ceil(avg);
  if (low === high || Math.abs(avg - low) < 0.05) {
    return low === 1 ? "1 bedroom" : `${low} bedrooms`;
  }
  return `${low}-${high} bedrooms`;
}

function domValueSignal(medDom: number | null): VintageSnapshotValueSignal {
  if (medDom == null) return "normal";
  if (medDom <= 10) return "bad";
  if (medDom >= 25) return "good";
  return "normal";
}

function priceValueSignal(
  value: number | null,
  benchmark: number | null,
): VintageSnapshotValueSignal {
  if (value == null || benchmark == null || benchmark <= 0) return "normal";
  const ratio = value / benchmark;
  if (ratio >= 1.12) return "bad";
  if (ratio <= 0.88) return "good";
  return "normal";
}

function isNewThisWeek(listing: VintageListingRow): boolean {
  return listing.dom != null && listing.dom <= 7;
}

function buildVintageMetrics(
  bucketListings: VintageListingRow[],
  totalListings: number,
  benchmarks: VintageSnapshotBenchmarks,
): VintageSnapshotMetric[] {
  const prices = bucketListings
    .map((listing) => listing.price)
    .filter((price) => price > 0);
  const doms = bucketListings
    .map((listing) => listing.dom)
    .filter((dom): dom is number => dom != null && dom >= 0);
  const ppsfs = bucketListings
    .filter((listing) => !listing.isRental)
    .map((listing) => listing.pricePerSqft)
    .filter((ppsf): ppsf is number => ppsf != null && ppsf > 0);
  const sqfts = bucketListings
    .filter(
      (listing) =>
        !listing.isCommercial && listing.sqft != null && listing.sqft > 0,
    )
    .map((listing) => listing.sqft as number);
  const bedCounts = bucketListings
    .filter(
      (listing) =>
        !listing.isCommercial && listing.beds != null && listing.beds > 0,
    )
    .map((listing) => listing.beds as number);

  const newListings = bucketListings.filter(isNewThisWeek).length;
  const reduced = bucketListings.filter(
    (listing) => listing.status === "Reduced",
  ).length;
  const medPrice = median(prices);
  const medDom = median(doms);
  const medSqft = median(sqfts);
  const avgPpsf = average(ppsfs);
  const avgBeds = average(bedCounts);
  const share =
    totalListings > 0 ? bucketListings.length / totalListings : null;

  return [
    {
      label: "Listings",
      value: String(bucketListings.length),
      trend:
        newListings > 0
          ? `${newListings} new this week`
          : share != null
            ? `${Math.round(share * 100)}% of view`
            : "—",
      valueSignal: "normal",
    },
    {
      label: "Reduced!",
      value: String(reduced),
      trend: reduced > 0 ? "Price cut active" : "No reductions",
      valueSignal: reduced > 0 ? "good" : "normal",
    },
    {
      label: "Median price",
      value: formatSnapshotPrice(medPrice),
      trend: medPrice ? `${formatSnapshotPrice(medPrice)} median` : "—",
      valueSignal: priceValueSignal(medPrice, benchmarks.medianPrice),
    },
    {
      label: "Median sqft",
      value: formatSnapshotSqft(medSqft),
      trend:
        medSqft != null && benchmarks.medianSqft != null
          ? medSqft >= benchmarks.medianSqft
            ? "Above view median"
            : "Below view median"
          : medSqft != null
            ? `${formatSnapshotSqft(medSqft)} sqft`
            : "No sqft data",
      valueSignal: "normal",
    },
    {
      label: "Median DOM",
      value: medDom != null ? `${Math.round(medDom)}d` : "—",
      trend:
        medDom != null && medDom <= 10
          ? "Moving fast"
          : medDom != null && medDom <= 20
            ? "Steady pace"
            : bucketListings.length
              ? "Slower market"
              : "—",
      valueSignal: domValueSignal(medDom),
    },
    {
      label: "Avg bedrooms",
      value: formatAvgBedrooms(avgBeds),
      trend: avgBeds != null ? `${avgBeds.toFixed(1)} avg` : "No bed data",
      valueSignal: "normal",
    },
    {
      label: "Share",
      value: share != null ? `${Math.round(share * 100)}%` : "—",
      trend:
        share != null
          ? `${bucketListings.length} of ${totalListings} listings`
          : "—",
      valueSignal: "normal",
    },
    {
      label: "Avg $/sqft",
      value: avgPpsf ? `$${Math.round(avgPpsf)}` : "—",
      trend: "Non-rental only",
      valueSignal: priceValueSignal(avgPpsf, benchmarks.avgPpsf),
    },
  ];
}

export function computeVintageSnapshotBenchmarks(
  listings: VintageListingRow[],
): VintageSnapshotBenchmarks {
  const prices = listings
    .map((listing) => listing.price)
    .filter((price) => price > 0);
  const ppsfs = listings
    .filter((listing) => !listing.isRental)
    .map((listing) => listing.pricePerSqft)
    .filter((ppsf): ppsf is number => ppsf != null && ppsf > 0);
  const sqfts = listings
    .filter(
      (listing) =>
        !listing.isCommercial && listing.sqft != null && listing.sqft > 0,
    )
    .map((listing) => listing.sqft as number);

  return {
    medianPrice: median(prices),
    avgPpsf: average(ppsfs),
    medianSqft: median(sqfts),
  };
}

export function buildVintageBucketSnapshots(
  listings: VintageListingRow[],
): VintageBucketSnapshot[] {
  if (listings.length === 0) return [];

  const benchmarks = computeVintageSnapshotBenchmarks(listings);
  const grouped = new Map<VintageBucketId, VintageListingRow[]>();

  for (const listing of listings) {
    const bucketId = classifyYearBuilt(listing.yearBuilt);
    const bucketListings = grouped.get(bucketId) ?? [];
    bucketListings.push(listing);
    grouped.set(bucketId, bucketListings);
  }

  const orderedIds: VintageBucketId[] = [
    ...VINTAGE_BUCKETS.map((bucket) => bucket.id),
    "unknown",
  ];

  return orderedIds
    .map((id) => {
      const bucketListings = grouped.get(id) ?? [];
      if (bucketListings.length === 0) return null;
      const label =
        id === "unknown"
          ? "Unknown"
          : (VINTAGE_BUCKETS.find((bucket) => bucket.id === id)?.label ?? id);
      return {
        id,
        label,
        metrics: buildVintageMetrics(
          bucketListings,
          listings.length,
          benchmarks,
        ),
      };
    })
    .filter((snapshot): snapshot is VintageBucketSnapshot => snapshot != null);
}
