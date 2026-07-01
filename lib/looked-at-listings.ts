import {
  clearClientPref,
  readClientPref,
  writeClientPref,
} from "@/lib/client-prefs";
import { listingDetailHref } from "@/lib/listing-url";
import { resolveListingTown } from "@/lib/tmre-towns";

export const LOOKED_AT_COOKIE = "tmre_looked_at";
const MAX_ENTRIES = 40;

export type LookedAtEntry = {
  id: string;
  href: string;
  address: string;
  city: string | null;
  zip: string | null;
  price: number | null;
  propertyType: string | null;
  viewedAt: string;
};

function sortLookedAtNewestFirst(entries: LookedAtEntry[]): LookedAtEntry[] {
  return [...entries].sort(
    (a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt),
  );
}

export function readLookedAtListings(): LookedAtEntry[] {
  const raw = readClientPref(LOOKED_AT_COOKIE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortLookedAtNewestFirst(parsed.filter(isLookedAtEntry));
  } catch {
    return [];
  }
}

function isLookedAtEntry(value: unknown): value is LookedAtEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<LookedAtEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.href === "string" &&
    typeof entry.address === "string" &&
    typeof entry.viewedAt === "string"
  );
}

export function recordLookedAtListing(input: {
  id: string;
  address: string;
  city?: string | null;
  zip?: string | null;
  price?: number | null;
  propertyType?: string | null;
}): void {
  const id = input.id.trim();
  const address = input.address.trim();
  if (!id || !address) return;

  const town =
    resolveListingTown(input.city) || input.city?.trim() || undefined;

  const entry: LookedAtEntry = {
    id,
    href: listingDetailHref(id, address, town),
    address,
    city: input.city?.trim() || null,
    zip: input.zip?.trim() || null,
    price: input.price ?? null,
    propertyType: input.propertyType?.trim() || null,
    viewedAt: new Date().toISOString(),
  };

  const next = [
    entry,
    ...readLookedAtListings().filter((item) => item.id !== id),
  ].slice(0, MAX_ENTRIES);

  writeClientPref(LOOKED_AT_COOKIE, JSON.stringify(next));
}

export function clearLookedAtListings(): void {
  clearClientPref(LOOKED_AT_COOKIE);
}
