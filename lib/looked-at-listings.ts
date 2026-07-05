import {
  clearClientPref,
  readClientPref,
} from "@/lib/client-prefs";
import { listingDetailHref } from "@/lib/listing-url";
import { resolveListingTown } from "@/lib/tmre-towns";

/** Legacy cookie name — migrated to localStorage on first read. */
export const LOOKED_AT_COOKIE = "tmre_looked_at";
export const LOOKED_AT_STORAGE_KEY = "tmre_looked_at";
export const LOOKED_AT_CHANGED_EVENT = "tmre:looked-at-changed";
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

function readRawLookedAtPref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LOOKED_AT_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage unavailable (private mode, etc.)
  }

  const legacy = readClientPref(LOOKED_AT_COOKIE);
  if (!legacy) return null;

  try {
    localStorage.setItem(LOOKED_AT_STORAGE_KEY, legacy);
    clearClientPref(LOOKED_AT_COOKIE);
  } catch {
    // Keep using cookie fallback below if localStorage fails.
  }
  return legacy;
}

function writeRawLookedAtPref(value: string): void {
  if (typeof window === "undefined") return;

  let wrote = false;
  try {
    localStorage.setItem(LOOKED_AT_STORAGE_KEY, value);
    wrote = true;
    clearClientPref(LOOKED_AT_COOKIE);
  } catch {
    // Fall back to cookie for a single entry if localStorage is full/unavailable.
  }

  if (!wrote) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        document.cookie = `${LOOKED_AT_COOKIE}=${encodeURIComponent(
          JSON.stringify([parsed[0]]),
        )}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      }
    } catch {
      return;
    }
  }

  window.dispatchEvent(new CustomEvent(LOOKED_AT_CHANGED_EVENT));
}

function clearRawLookedAtPref(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOOKED_AT_STORAGE_KEY);
  } catch {
    // ignore
  }
  clearClientPref(LOOKED_AT_COOKIE);
  window.dispatchEvent(new CustomEvent(LOOKED_AT_CHANGED_EVENT));
}

function normalizeEntry(value: unknown): LookedAtEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<LookedAtEntry>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.address !== "string" ||
    typeof entry.viewedAt !== "string"
  ) {
    return null;
  }

  const town =
    resolveListingTown(entry.city) || entry.city?.trim() || undefined;

  return {
    id: entry.id,
    href:
      typeof entry.href === "string" && entry.href.trim()
        ? entry.href
        : listingDetailHref(entry.id, entry.address, town),
    address: entry.address,
    city: entry.city?.trim() || null,
    zip: entry.zip?.trim() || null,
    price: entry.price ?? null,
    propertyType: entry.propertyType?.trim() || null,
    viewedAt: entry.viewedAt,
  };
}

export function readLookedAtListings(): LookedAtEntry[] {
  const raw = readRawLookedAtPref();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortLookedAtNewestFirst(
      parsed
        .map(normalizeEntry)
        .filter((entry): entry is LookedAtEntry => entry != null),
    );
  } catch {
    return [];
  }
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

  writeRawLookedAtPref(JSON.stringify(next));
}

export function clearLookedAtListings(): void {
  clearRawLookedAtPref();
}
