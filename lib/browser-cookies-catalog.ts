/**
 * Known TMRE browser cookies + related browser storage — Admin → Cookies.
 * Client-safe (no secrets). Keep in sync when adding writeClientPref keys.
 */

export type CookieCategory =
  | "session"
  | "intelligence"
  | "find"
  | "stats"
  | "open-houses"
  | "new-construction"
  | "expired"
  | "fixer"
  | "deal-of-the-day"
  | "listing"
  | "alerts"
  | "legacy";

export type KnownCookieInfo = {
  purpose: string;
  /** Short group label for Admin catalog. */
  category: CookieCategory;
  httpOnly?: boolean;
  /** Cookie Path attribute (always `/` for TMRE prefs). */
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  /** Where the cookie is written (for Admin location column). */
  setBy?: string;
  /**
   * Lifetime hint for Admin docs.
   * Pref cookies use Max-Age ≈ 1 year via lib/client-prefs.ts.
   */
  lifetime?: string;
};

export const SITE_VISITOR_COOKIE = "tmre_vid";

/** Pref cookie lifetime (matches lib/client-prefs.ts Max-Age). */
export const CLIENT_PREF_LIFETIME = "~1 year (Max-Age via lib/client-prefs.ts)";

const PREF: Pick<
  KnownCookieInfo,
  "path" | "sameSite" | "setBy" | "lifetime"
> = {
  path: "/",
  sameSite: "Lax",
  setBy: "document.cookie via lib/client-prefs.ts",
  lifetime: CLIENT_PREF_LIFETIME,
};

function pref(
  purpose: string,
  category: CookieCategory,
): KnownCookieInfo {
  return { purpose, category, ...PREF };
}

/** Catalog of cookies this app sets (prefs + HttpOnly session/visitor). */
export const KNOWN_SITE_COOKIES: Record<string, KnownCookieInfo> = {
  tmre_site_pass: {
    purpose:
      "Admin / Visitors unlock — set after correct site password; required for /admin and gated visitor APIs",
    category: "session",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    setBy: "POST /api/site-password",
    lifetime: "Session / server-set (cleared on Admin “Delete” or Clear all)",
  },
  [SITE_VISITOR_COOKIE]: {
    purpose:
      "Anonymous visitor id — ties leads, listing alerts, and visitor log rows to this browser",
    category: "session",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    setBy: "POST /api/visitor/log",
    lifetime: "Long-lived HttpOnly (server-set)",
  },
  tmre_user_session: {
    purpose:
      "Passwordless end-user session after magic-link verify (saved-search manage, etc.)",
    category: "session",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    setBy: "GET /api/auth/verify",
    lifetime: "Server-set session cookie",
  },

  tmre_intel_city: pref(
    "Intelligence — selected town (or All Towns)",
    "intelligence",
  ),
  tmre_tx: pref(
    "Sale / rental transaction filter (shared by Intelligence + several boards)",
    "intelligence",
  ),
  tmre_cls: pref(
    "Property class filter (residential / commercial, etc.)",
    "intelligence",
  ),
  tmre_sale_property: pref(
    "Sale property-type filter (homes / multi / condos)",
    "intelligence",
  ),
  tmre_intel_min_beds: pref("Intelligence — minimum bedrooms", "intelligence"),
  tmre_intel_max_beds: pref("Intelligence — maximum bedrooms", "intelligence"),
  tmre_intel_min_baths: pref("Intelligence — minimum bathrooms", "intelligence"),
  tmre_intel_max_baths: pref("Intelligence — maximum bathrooms", "intelligence"),
  tmre_intel_min_vintage: pref(
    "Intelligence — minimum vintage / year-built band",
    "intelligence",
  ),
  tmre_intel_max_vintage: pref(
    "Intelligence — maximum vintage / year-built band",
    "intelligence",
  ),
  tmre_intel_new_construction: pref(
    "Intelligence — construction type filter (any / new / not-new)",
    "intelligence",
  ),
  tmre_intel_furnished: pref(
    "Intelligence — furnished filter (rentals)",
    "intelligence",
  ),
  tmre_intel_zip: pref("Intelligence — zip pill selection", "intelligence"),
  tmre_intel_board_status: pref(
    "Intelligence deal board — status filter (Active / New / Reduced / …)",
    "intelligence",
  ),
  tmre_intel_filters_expanded: pref(
    "Intelligence — whether the filter chrome is expanded",
    "intelligence",
  ),
  tmre_intel_sort_key: pref(
    "Intelligence deal board — sort column (score, price, …)",
    "intelligence",
  ),
  tmre_intel_sort_dir: pref(
    "Intelligence deal board — sort direction (asc/desc)",
    "intelligence",
  ),
  tmre_intel_stats_expanded_towns: pref(
    "Intelligence — which town stats rows are expanded (comma-separated)",
    "intelligence",
  ),
  "intel-board-view-v2": pref(
    "Intelligence deal board — view mode (cards / list / …)",
    "intelligence",
  ),

  tmre_search_history: pref(
    "Unique search fingerprints from Intelligence filters — feeds listing-alert signup matching",
    "alerts",
  ),

  tmre_find_town: pref("Find page — town filter", "find"),

  tmre_stats_listing_pool: pref(
    "Stats — listing pool (active / sold / …)",
    "stats",
  ),
  tmre_stats_city: pref("Stats — town selection", "stats"),
  tmre_stats_kind: pref("Stats — sale vs rental", "stats"),
  tmre_stats_table_mode: pref("Stats — table display mode", "stats"),
  tmre_stats_price_bucket: pref(
    "Stats — selected price-band bucket",
    "stats",
  ),

  tmre_oh_town: pref("Open houses — town filter", "open-houses"),
  tmre_oh_tx: pref("Open houses — sale / rental", "open-houses"),
  tmre_oh_sort: pref("Open houses — sort", "open-houses"),
  tmre_oh_view: pref("Open houses — view mode", "open-houses"),

  tmre_nc_status: pref("New construction — status filter", "new-construction"),
  tmre_nc_town: pref("New construction — town filter", "new-construction"),
  tmre_nc_tx: pref("New construction — sale / rental", "new-construction"),
  tmre_nc_price_sort: pref(
    "New construction — price sort direction",
    "new-construction",
  ),
  tmre_nc_view: pref("New construction — view mode", "new-construction"),

  tmre_el_age: pref("Expired listings — age filter", "expired"),
  tmre_el_town: pref("Expired listings — town filter", "expired"),
  tmre_el_tx: pref("Expired listings — sale / rental", "expired"),
  tmre_el_price_sort: pref(
    "Expired listings — price sort direction",
    "expired",
  ),
  tmre_el_view: pref("Expired listings — view mode", "expired"),

  tmre_fixer_town: pref("Fixer-uppers — town filter", "fixer"),
  tmre_fixer_cat: pref("Fixer-uppers — category filter", "fixer"),

  "deal-of-the-day-tx": pref(
    "Deal of the Day — sale / rental",
    "deal-of-the-day",
  ),
  "deal-of-the-day-property": pref(
    "Deal of the Day — property subtype (homes / multi / condos)",
    "deal-of-the-day",
  ),

  tmre_looked_at: pref(
    "Legacy looked-at MLS ids (prefer localStorage key of the same name)",
    "legacy",
  ),
  tmre_if_range_anim_seen: pref(
    "What If — MLS ids that already used Median/Average/Weighted (skip range size animation)",
    "listing",
  ),
};

export const COOKIE_CATEGORY_LABELS: Record<CookieCategory, string> = {
  session: "Session / identity",
  intelligence: "Intelligence",
  find: "Find",
  stats: "Stats",
  "open-houses": "Open houses",
  "new-construction": "New construction",
  expired: "Expired listings",
  fixer: "Fixer-uppers",
  "deal-of-the-day": "Deal of the Day",
  listing: "Listing / What If",
  alerts: "Listing alerts",
  legacy: "Legacy",
};

/** Non-cookie browser storage the site uses for prefs / navigation (not sent to the server). */
export type KnownStorageKind = "sessionStorage" | "localStorage";

export type KnownBrowserStorageInfo = {
  key: string;
  kind: KnownStorageKind;
  purpose: string;
  category: string;
};

export const KNOWN_BROWSER_STORAGE: readonly KnownBrowserStorageInfo[] = [
  {
    key: "tmre_latest_view",
    kind: "sessionStorage",
    purpose:
      "Latest — group-by-town/zip, selected town, collapsed/expanded groups, status pills, scrollY (restored after listing Back; skipped on hard refresh; cleared when the tab closes)",
    category: "Latest",
  },
  {
    key: "listing-return-nav",
    kind: "sessionStorage",
    purpose:
      "Listing pages — remembered on-site Back target (href + label) so listing→listing / refresh keep “Back to Latest / Intelligence / …”",
    category: "Listing nav",
  },
  {
    key: "tmre_looked_at",
    kind: "localStorage",
    purpose:
      "MLS ids the visitor has opened (looked-at); survives tab close — cookie twin is legacy",
    category: "Listing",
  },
  {
    key: "tmre_visitor_postal_override",
    kind: "localStorage",
    purpose:
      "Header ZIP pill — manual postal override for town personalization",
    category: "Header / location",
  },
  {
    key: "tmre_zip_pill_glow_dismissed",
    kind: "localStorage",
    purpose: "Header ZIP pill — hide the gold glow after first interaction",
    category: "Header / location",
  },
  {
    key: "tmre_intel_deal_focus",
    kind: "sessionStorage",
    purpose: "Intelligence deal board — temporary focus / highlight state",
    category: "Intelligence",
  },
];

export type CookieLocationInfo = {
  path: string;
  domain: string | null;
  sameSite: string | null;
  secure: boolean | null;
  /** How / where the app writes this cookie. */
  setBy: string | null;
  /** true when path/domain came from Cookie Store API. */
  observed: boolean;
};

export function cookiePurpose(name: string): string {
  const known = KNOWN_SITE_COOKIES[name];
  if (known) return known.purpose;
  if (name.startsWith("tmre_stats_sales_by_town_")) {
    return "Stats — sales-by-town chart years or timeline mode (per kind)";
  }
  if (name.startsWith("tmre_stats_")) return "Stats chart preference";
  if (name.startsWith("tmre_")) return "Site preference (unlisted — add to catalog)";
  return "Unknown / third-party or leftover";
}

export function cookieCategory(name: string): CookieCategory | null {
  return KNOWN_SITE_COOKIES[name]?.category ?? null;
}

export function cookieLifetime(name: string): string | null {
  return KNOWN_SITE_COOKIES[name]?.lifetime ?? null;
}

export function isKnownHttpOnlyCookie(name: string): boolean {
  return KNOWN_SITE_COOKIES[name]?.httpOnly === true;
}

/** Catalog defaults when Cookie Store / Set-Cookie attrs are unavailable. */
export function cookieLocationFromCatalog(name: string): CookieLocationInfo {
  const known = KNOWN_SITE_COOKIES[name];
  const isPref =
    !known?.httpOnly &&
    (Boolean(known) || name.startsWith("tmre_") || name.startsWith("intel-"));
  return {
    path: known?.path ?? (isPref ? "/" : "—"),
    domain: null,
    sameSite: known?.sameSite ?? (isPref ? "Lax" : null),
    secure: null,
    setBy:
      known?.setBy ??
      (isPref ? "document.cookie via lib/client-prefs.ts" : null),
    observed: false,
  };
}

export function formatCookieLocation(loc: CookieLocationInfo): string {
  const parts: string[] = [];
  if (loc.path && loc.path !== "—") parts.push(`Path=${loc.path}`);
  if (loc.domain) parts.push(`Domain=${loc.domain}`);
  else if (typeof window !== "undefined") {
    parts.push(`Host=${window.location.hostname}`);
  }
  if (loc.sameSite) parts.push(`SameSite=${loc.sameSite}`);
  if (loc.secure === true) parts.push("Secure");
  if (loc.secure === false) parts.push("Secure=false");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function previewCookieValue(value: string, max = 64): string {
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

type CookieStoreLike = {
  getAll: () => Promise<
    Array<{
      name: string;
      value: string;
      domain?: string | null;
      path?: string | null;
      sameSite?: string | null;
      secure?: boolean;
    }>
  >;
};

/** Cookie Store API — path/domain for non-HttpOnly cookies (Chromium). */
export async function readCookieStoreEntries(): Promise<
  Array<{
    name: string;
    value: string;
    location: CookieLocationInfo;
  }>
> {
  if (typeof window === "undefined") return [];
  const store = (window as unknown as { cookieStore?: CookieStoreLike })
    .cookieStore;
  if (!store?.getAll) return [];
  try {
    const entries = await store.getAll();
    return entries.map((e) => {
      const catalog = cookieLocationFromCatalog(e.name);
      return {
        name: e.name,
        value: e.value,
        location: {
          path: e.path || catalog.path,
          domain: e.domain || null,
          sameSite: e.sameSite || catalog.sameSite,
          secure: typeof e.secure === "boolean" ? e.secure : catalog.secure,
          setBy: catalog.setBy,
          observed: true,
        },
      };
    });
  } catch {
    return [];
  }
}

/** Sorted catalog entries for Admin reference (includes absent cookies). */
export function listKnownSiteCookies(): Array<{
  name: string;
  info: KnownCookieInfo;
}> {
  return Object.entries(KNOWN_SITE_COOKIES)
    .map(([name, info]) => ({ name, info }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
