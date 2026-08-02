/**
 * Known TMRE browser cookies — purposes for Admin → Cookies.
 * Client-safe (no secrets).
 */

export type KnownCookieInfo = {
  purpose: string;
  httpOnly?: boolean;
  /** Cookie Path attribute (always `/` for TMRE prefs). */
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  /** Where the cookie is written (for Admin location column). */
  setBy?: string;
};

export const SITE_VISITOR_COOKIE = "tmre_vid";

const PREF: Pick<KnownCookieInfo, "path" | "sameSite" | "setBy"> = {
  path: "/",
  sameSite: "Lax",
  setBy: "document.cookie via lib/client-prefs.ts",
};

/** Catalog of cookies this app sets (prefs + HttpOnly session/visitor). */
export const KNOWN_SITE_COOKIES: Record<string, KnownCookieInfo> = {
  tmre_site_pass: {
    purpose: "Admin / Visitors unlock session",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    setBy: "POST /api/site-password",
  },
  [SITE_VISITOR_COOKIE]: {
    purpose: "Anonymous visitor id (leads, alerts, logging)",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    setBy: "POST /api/visitor/log",
  },
  tmre_user_session: {
    purpose: "Passwordless end-user session (magic-link login)",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    setBy: "GET /api/auth/verify",
  },
  tmre_intel_city: { purpose: "Intelligence town filter", ...PREF },
  tmre_tx: { purpose: "Sale / rental transaction filter", ...PREF },
  tmre_cls: { purpose: "Property class filter", ...PREF },
  tmre_sale_property: { purpose: "Sale property-type filter", ...PREF },
  tmre_intel_min_beds: { purpose: "Intelligence min beds", ...PREF },
  tmre_intel_max_beds: { purpose: "Intelligence max beds", ...PREF },
  tmre_intel_min_baths: { purpose: "Intelligence min baths", ...PREF },
  tmre_intel_max_baths: { purpose: "Intelligence max baths", ...PREF },
  tmre_intel_min_vintage: { purpose: "Intelligence min vintage", ...PREF },
  tmre_intel_max_vintage: { purpose: "Intelligence max vintage", ...PREF },
  tmre_intel_new_construction: {
    purpose: "Intelligence new-construction filter",
    ...PREF,
  },
  tmre_intel_furnished: { purpose: "Intelligence furnished filter", ...PREF },
  tmre_intel_zip: { purpose: "Intelligence zip filter", ...PREF },
  tmre_intel_board_status: {
    purpose: "Intelligence board status filter",
    ...PREF,
  },
  tmre_intel_filters_expanded: {
    purpose: "Intelligence filters expanded",
    ...PREF,
  },
  tmre_intel_sort_key: { purpose: "Intelligence sort key", ...PREF },
  tmre_intel_sort_dir: { purpose: "Intelligence sort direction", ...PREF },
  tmre_intel_stats_expanded_towns: {
    purpose: "Intelligence town-stats expand",
    ...PREF,
  },
  "intel-board-view-v2": {
    purpose: "Intelligence deal-board view mode",
    ...PREF,
  },
  tmre_search_history: { purpose: "Unique search history (alerts)", ...PREF },
  tmre_find_town: { purpose: "Find page town", ...PREF },
  tmre_stats_listing_pool: { purpose: "Stats listing pool", ...PREF },
  tmre_stats_city: { purpose: "Stats town", ...PREF },
  tmre_stats_kind: { purpose: "Stats sale / rental", ...PREF },
  tmre_stats_table_mode: { purpose: "Stats table mode", ...PREF },
  tmre_stats_price_bucket: { purpose: "Stats price-band selection", ...PREF },
  tmre_oh_town: { purpose: "Open houses town", ...PREF },
  tmre_oh_tx: { purpose: "Open houses transaction", ...PREF },
  tmre_oh_sort: { purpose: "Open houses sort", ...PREF },
  tmre_oh_view: { purpose: "Open houses view", ...PREF },
  tmre_nc_status: { purpose: "New construction status", ...PREF },
  tmre_nc_town: { purpose: "New construction town", ...PREF },
  tmre_nc_tx: { purpose: "New construction transaction", ...PREF },
  tmre_nc_price_sort: { purpose: "New construction price sort", ...PREF },
  tmre_nc_view: { purpose: "New construction view", ...PREF },
  tmre_el_age: { purpose: "Expired listings age", ...PREF },
  tmre_el_town: { purpose: "Expired listings town", ...PREF },
  tmre_el_tx: { purpose: "Expired listings transaction", ...PREF },
  tmre_el_price_sort: { purpose: "Expired listings price sort", ...PREF },
  tmre_el_view: { purpose: "Expired listings view", ...PREF },
  tmre_fixer_town: { purpose: "Fixer-uppers town", ...PREF },
  tmre_fixer_cat: { purpose: "Fixer-uppers category", ...PREF },
  "deal-of-the-day-tx": { purpose: "Deal of the Day transaction", ...PREF },
  "deal-of-the-day-property": {
    purpose: "Deal of the Day property type",
    ...PREF,
  },
  tmre_looked_at: {
    purpose: "Legacy looked-at listings (prefer localStorage)",
    ...PREF,
  },
  tmre_if_range_anim_seen: {
    purpose:
      "What if: MLS ids that have used Median/Average/Weighted — skip range size animation",
    ...PREF,
  },
};

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
  if (name.startsWith("tmre_stats_")) return "Stats chart preference";
  if (name.startsWith("tmre_")) return "Site preference";
  return "Unknown / third-party or leftover";
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
