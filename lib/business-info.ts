// ---------------------------------------------------------------------------
// Central business identity used across trust-signal surfaces (metadata,
// JSON-LD, footer disclosure, privacy/terms/contact pages, security.txt).
//
// Keeping this in one place means the legal name, brokerage attribution,
// canonical URL, and contact address stay consistent everywhere — which is
// exactly what human visitors AND automated site categorizers look for when
// deciding whether a domain is a legitimate business.
//
// Anything that could change per-environment (the canonical origin) is read
// from an env var with a sensible production fallback.
// ---------------------------------------------------------------------------

/** Canonical production origin, no trailing slash. Override with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ||
  'https://tmrebuilder.com'
)

/** Short brand shown in the tab, footer, and logo. */
export const BRAND_NAME = 'TMRE'

/** Human tagline used in metadata + hero copy. */
export const BRAND_TAGLINE = 'Confidence through clarity'

/** The licensed agent behind the brand. */
export const AGENT_NAME = 'Timothy Marks'

/** SmartMLS / brokerage agent ID for Timothy Marks. */
export const AGENT_MLS_ID = '855109'

/** Sponsoring brokerage (real-estate license is held here). */
export const BROKERAGE_NAME = 'Berkshire Hathaway HomeServices New England Properties'

// ---------------------------------------------------------------------------
// Phone helpers (client-safe). The live number is admin-configurable via
// sync_meta (see lib/phone-config.ts) — these are the format utilities plus the
// built-in default used as a fallback everywhere the configured value is
// unavailable.
// ---------------------------------------------------------------------------

/** Built-in fallback number (raw 10 digits). Admin can override at runtime. */
export const DEFAULT_PHONE_DIGITS = '6175040741'

/** Reduce any user input to a bare US 10-digit string (drops a leading 1). */
export function normalizePhoneDigits(input: string): string {
  let digits = (input || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits
}

/** Format 10 digits as "(XXX) XXX-XXXX"; returns the input unchanged otherwise. */
export function formatPhoneDisplay(digits: string): string {
  const d = normalizePhoneDigits(digits)
  if (d.length !== 10) return digits
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Default number, raw digits (for tel: links). */
export const AGENT_PHONE_TEL = DEFAULT_PHONE_DIGITS
/** Default number, pretty form (for display). */
export const AGENT_PHONE_DISPLAY = formatPhoneDisplay(DEFAULT_PHONE_DIGITS)

/** Primary market region, human readable. */
export const PRIMARY_MARKET = 'Fairfield County, CT'

/** All served markets, for schema + copy. */
export const SERVED_AREAS = [
  'Fairfield County, Connecticut',
  'Greater Boston, Massachusetts',
  'South Florida',
] as const

/** Where the practice is based (used in schema + footer). */
export const BASED_IN = 'Westport, Connecticut'

/**
 * Optional business details. Left blank until confirmed — we deliberately do
 * NOT fabricate a phone number, office street address, or license number, since
 * publishing wrong legal details is worse for trust than omitting them. Fill
 * these in (or wire to env) once verified and they will flow into the footer
 * disclosure and JSON-LD automatically.
 */
export const BUSINESS_PHONE = process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim() || ''
export const OFFICE_ADDRESS = process.env.NEXT_PUBLIC_OFFICE_ADDRESS?.trim() || ''
export const AGENT_LICENSE = process.env.NEXT_PUBLIC_AGENT_LICENSE?.trim() || ''

/** Brand image used for social/OG cards until a dedicated 1200×630 card exists. */
export const BRAND_IMAGE_PATH = '/images/four-lens-camera.png'

/** Absolute URL helper for schema/metadata. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * schema.org RealEstateAgent node describing the business. Emitted as JSON-LD
 * in the root layout. Only includes fields we can state truthfully; optional
 * legal details are added when present.
 */
export function realEstateAgentJsonLd(
  opts: { phoneDisplay?: string | null } = {},
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': `${SITE_URL}/#business`,
    name: `${BRAND_NAME} — ${AGENT_NAME}`,
    alternateName: BRAND_NAME,
    url: SITE_URL,
    image: absoluteUrl(BRAND_IMAGE_PATH),
    logo: absoluteUrl(BRAND_IMAGE_PATH),
    // NB: email is intentionally omitted from public structured data to avoid
    // handing scraper bots a plaintext address. Contact routes through the form.
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: `${SITE_URL}/contact`,
      areaServed: 'US',
      availableLanguage: 'English',
    },
    slogan: BRAND_TAGLINE,
    description: `Data-driven real estate market intelligence and advisory for ${PRIMARY_MARKET} and beyond.`,
    areaServed: SERVED_AREAS.map((name) => ({ '@type': 'Place', name })),
    knowsAbout: [
      'Residential real estate',
      'Real estate market analysis',
      'Home valuation',
      'Real estate investment analysis',
    ],
    parentOrganization: {
      '@type': 'Organization',
      name: BROKERAGE_NAME,
    },
    founder: {
      '@type': 'Person',
      name: AGENT_NAME,
      jobTitle: 'Real Estate Agent',
      worksFor: { '@type': 'Organization', name: BROKERAGE_NAME },
    },
  }

  const telephone = opts.phoneDisplay?.trim() || BUSINESS_PHONE
  if (telephone) node.telephone = telephone
  if (OFFICE_ADDRESS) node.address = OFFICE_ADDRESS

  return node
}
