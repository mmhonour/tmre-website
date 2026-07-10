export const LISTING_RETURN_STORAGE_KEY = "listing-return-nav";

export const DEFAULT_RETURN_NAV = {
  href: "/intelligence",
  label: "Deal board",
} as const;

export type ReturnNav = { href: string; label: string };

export function isListingPath(pathname: string): boolean {
  return /^\/listings\/[^/]+(\/|$)/.test(pathname);
}

function isListingHref(href: string): boolean {
  return isListingPath(parseReturnHref(href).pathname);
}

function parseReturnHref(href: string): {
  pathname: string;
  search: string;
  hash: string;
} {
  const hashIdx = href.indexOf("#");
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const qIdx = withoutHash.indexOf("?");
  const pathname = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const search = qIdx >= 0 ? withoutHash.slice(qIdx) : "";
  return { pathname, search, hash };
}

function titleCaseSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function labelForIntelligenceListings(search: string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const status = params.get("status");
  if (status === "new") return "New listings";
  if (status === "reduced") return "Price-reduced listings";
  if (status === "closed") {
    return params.get("tx") === "rental" ? "Leased this week" : "Closed this week";
  }
  return "Listings";
}

export function buildReturnPath(
  pathname: string,
  search: string,
  hash?: string,
): string {
  const qs = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";
  const h = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${pathname}${qs}${h}`;
}

export function labelForReturnPath(href: string): string {
  const { pathname, search, hash } = parseReturnHref(href);

  if (pathname === "/") return "Home";
  if (pathname === "/intelligence") {
    return hash === "#intel-stats-panel" ? "Intelligence" : "Deal board";
  }
  if (pathname === "/intelligence/listings") {
    return labelForIntelligenceListings(search);
  }
  if (pathname === "/latest") return "Latest";
  if (pathname === "/stats") return "Stats";
  if (pathname === "/deal-of-the-day") return "Deal of the Day";
  if (pathname === "/open-houses") return "Open Houses";
  if (pathname === "/new-construction/expired-listings") return "Expired Listings";
  if (pathname === "/new-construction") return "New Construction";
  if (pathname === "/fixer-uppers") return "Fixer Uppers";
  if (pathname === "/find") return "Find";
  if (pathname === "/lookey") return "Lookey";

  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? titleCaseSegment(last) : "Back";
}

export function parseReturnFromSearchParams(
  params: URLSearchParams,
): ReturnNav | null {
  const raw = params.get("from");
  if (!raw) return null;

  let href: string;
  try {
    href = decodeURIComponent(raw);
  } catch {
    href = raw;
  }

  if (!href.startsWith("/") || isListingPath(parseReturnHref(href).pathname)) {
    return null;
  }

  return { href, label: labelForReturnPath(href) };
}

export function appendReturnToHref(href: string, returnPath: string): string {
  if (!returnPath || !isListingHref(href)) return href;

  const hashIdx = href.indexOf("#");
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const qIdx = withoutHash.indexOf("?");
  const pathPart = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const existingQuery = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : "";

  const params = new URLSearchParams(existingQuery);
  if (params.has("from")) return href;
  params.set("from", returnPath);

  const qs = params.toString();
  return `${pathPart}${qs ? `?${qs}` : ""}${hash}`;
}

function parseSameOriginReferrer(
  referrer: string,
  origin?: string | null,
): string | null {
  try {
    const refUrl = new URL(referrer);
    if (origin && refUrl.origin !== origin) return null;
    if (isListingPath(refUrl.pathname)) return null;
    return buildReturnPath(refUrl.pathname, refUrl.search, refUrl.hash);
  } catch {
    return null;
  }
}

export function resolveReturnNav(opts: {
  fromParam?: string | null;
  storedJson?: string | null;
  referrer?: string | null;
  origin?: string | null;
}): ReturnNav {
  if (opts.fromParam) {
    let href: string;
    try {
      href = decodeURIComponent(opts.fromParam);
    } catch {
      href = opts.fromParam;
    }
    if (href.startsWith("/") && !isListingPath(parseReturnHref(href).pathname)) {
      return { href, label: labelForReturnPath(href) };
    }
  }

  if (opts.storedJson) {
    try {
      const stored = JSON.parse(opts.storedJson) as Partial<ReturnNav>;
      if (
        typeof stored.href === "string" &&
        stored.href.startsWith("/") &&
        typeof stored.label === "string" &&
        !isListingPath(parseReturnHref(stored.href).pathname)
      ) {
        return { href: stored.href, label: stored.label };
      }
    } catch {
      // ignore invalid sessionStorage payload
    }
  }

  if (opts.referrer) {
    const href = parseSameOriginReferrer(opts.referrer, opts.origin);
    if (href) {
      return { href, label: labelForReturnPath(href) };
    }
  }

  return { ...DEFAULT_RETURN_NAV };
}

export function persistReturnNav(nav: ReturnNav): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(LISTING_RETURN_STORAGE_KEY, JSON.stringify(nav));
}
