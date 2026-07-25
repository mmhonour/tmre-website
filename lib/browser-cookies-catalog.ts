/**
 * Known TMRE browser cookies — purposes for Admin → Data controls → Browser cookies.
 * Client-safe (no secrets).
 */

export type KnownCookieInfo = {
  purpose: string;
  httpOnly?: boolean;
};

export const SITE_VISITOR_COOKIE = "tmre_vid";

/** Catalog of cookies this app sets (prefs + HttpOnly session/visitor). */
export const KNOWN_SITE_COOKIES: Record<string, KnownCookieInfo> = {
  tmre_site_pass: {
    purpose: "Admin / Visitors unlock session",
    httpOnly: true,
  },
  [SITE_VISITOR_COOKIE]: {
    purpose: "Anonymous visitor id (leads, alerts, logging)",
    httpOnly: true,
  },
  tmre_intel_city: { purpose: "Intelligence town filter" },
  tmre_tx: { purpose: "Sale / rental transaction filter" },
  tmre_cls: { purpose: "Property class filter" },
  tmre_sale_property: { purpose: "Sale property-type filter" },
  tmre_intel_min_beds: { purpose: "Intelligence min beds" },
  tmre_intel_max_beds: { purpose: "Intelligence max beds" },
  tmre_intel_min_baths: { purpose: "Intelligence min baths" },
  tmre_intel_max_baths: { purpose: "Intelligence max baths" },
  tmre_intel_min_vintage: { purpose: "Intelligence min vintage" },
  tmre_intel_max_vintage: { purpose: "Intelligence max vintage" },
  tmre_intel_new_construction: { purpose: "Intelligence new-construction filter" },
  tmre_intel_furnished: { purpose: "Intelligence furnished filter" },
  tmre_intel_zip: { purpose: "Intelligence zip filter" },
  tmre_intel_board_status: { purpose: "Intelligence board status filter" },
  tmre_intel_filters_expanded: { purpose: "Intelligence filters expanded" },
  tmre_intel_sort_key: { purpose: "Intelligence sort key" },
  tmre_intel_sort_dir: { purpose: "Intelligence sort direction" },
  tmre_intel_stats_expanded_towns: { purpose: "Intelligence town-stats expand" },
  "intel-board-view-v2": { purpose: "Intelligence deal-board view mode" },
  tmre_search_history: { purpose: "Unique search history (alerts)" },
  tmre_find_town: { purpose: "Find page town" },
  tmre_stats_listing_pool: { purpose: "Stats listing pool" },
  tmre_stats_city: { purpose: "Stats town" },
  tmre_stats_kind: { purpose: "Stats sale / rental" },
  tmre_stats_table_mode: { purpose: "Stats table mode" },
  tmre_stats_price_bucket: { purpose: "Stats price-band selection" },
  tmre_oh_town: { purpose: "Open houses town" },
  tmre_oh_tx: { purpose: "Open houses transaction" },
  tmre_oh_sort: { purpose: "Open houses sort" },
  tmre_oh_view: { purpose: "Open houses view" },
  tmre_nc_status: { purpose: "New construction status" },
  tmre_nc_town: { purpose: "New construction town" },
  tmre_nc_tx: { purpose: "New construction transaction" },
  tmre_nc_price_sort: { purpose: "New construction price sort" },
  tmre_nc_view: { purpose: "New construction view" },
  tmre_el_age: { purpose: "Expired listings age" },
  tmre_el_town: { purpose: "Expired listings town" },
  tmre_el_tx: { purpose: "Expired listings transaction" },
  tmre_el_price_sort: { purpose: "Expired listings price sort" },
  tmre_el_view: { purpose: "Expired listings view" },
  tmre_fixer_town: { purpose: "Fixer-uppers town" },
  tmre_fixer_cat: { purpose: "Fixer-uppers category" },
  "deal-of-the-day-tx": { purpose: "Deal of the Day transaction" },
  "deal-of-the-day-property": { purpose: "Deal of the Day property type" },
  tmre_looked_at: { purpose: "Legacy looked-at listings (prefer localStorage)" },
};

export function cookiePurpose(name: string): string {
  const known = KNOWN_SITE_COOKIES[name];
  if (known) return known.purpose;
  if (name.startsWith("tmre_stats_")) return "Stats chart preference";
  if (name.startsWith("tmre_")) return "Site preference";
  return "Unknown / third-party or leftover";
}

export function isKnownHttpOnlyCookie(name: string): boolean {
  return KNOWN_SITE_COOKIES[name]?.httpOnly === true;
}

export function previewCookieValue(
  value: string,
  max = 64,
): string {
  if (!value) return "(empty)";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/** Parse `document.cookie` into name/value pairs. */
export function parseDocumentCookies(
  raw: string,
): Array<{ name: string; value: string }> {
  if (!raw.trim()) return [];
  const out: Array<{ name: string; value: string }> = [];
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    out.push({ name, value });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Clear a non-HttpOnly cookie (Path=/). */
export function deleteDocumentCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  // Belt-and-suspenders for cookies set without Path
  document.cookie = `${name}=; Max-Age=0; SameSite=Lax`;
}
