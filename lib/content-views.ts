/**
 * Resolves a logged pageview path to the thing that was viewed — a property or
 * a plain page. Safe for client imports (no database access here).
 *
 * Resolution happens at write time so later edits to the spotlight config cannot
 * rewrite history: whichever property a spotlight tab pointed at when the visit
 * happened is the property that visit is credited to.
 */

import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
} from '@/lib/spotlight-listing'

export type ContentViewKind = 'listing' | 'page'

export type ResolvedContent = {
  kind: ContentViewKind
  /** Stable identity: 'listing:{mlsId}' or 'page:{path}'. */
  contentKey: string
  mlsId: string | null
  /** Canonical path — property sub-tabs roll up to the property itself. */
  path: string
  /** Property sub-tab the visit landed on, when it was one. */
  section: string | null
}

/** Sub-routes shared by /listings/[mlsId] and /spotlight. */
const PROPERTY_SECTIONS = new Set([
  'comparable-rentals',
  'comparables',
  'history',
  'if',
  'on-the-market',
  'photos',
  'uag',
])

const PAGE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/about': 'About',
  '/contact': 'Contact',
  '/deal-model': 'Deal model',
  '/deal-of-the-day': 'Deal of the Day',
  '/fed-analysis': 'Fed analysis',
  '/find': 'Find',
  '/intelligence': 'Intelligence',
  '/intelligence/listings': 'Intelligence listings',
  '/latest': 'Latest',
  '/list-with-me': 'List with me',
  '/market-pulse': 'Market Pulse',
  '/mortgage-rates': 'Mortgage rates',
  '/new-construction': 'New construction',
  '/spotlight': 'Spotlight',
  '/stats': 'Stats',
  '/town-budget': 'Town budget',
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function sectionAt(segments: string[], index: number): string | null {
  const segment = segments[index]
  return segment && PROPERTY_SECTIONS.has(segment) ? segment : null
}

/**
 * @param rawPath pathname, optionally with a query string (`/spotlight?property=3`).
 */
export function resolveViewedContent(rawPath: string): ResolvedContent {
  const [rawPathname, rawSearch = ''] = rawPath.split('?')
  const pathname = rawPathname.replace(/\/+$/, '') || '/'
  const segments = pathname.split('/').filter(Boolean)

  // Canonical route is /listings/[id]; /listing/[id] is a legacy redirect target
  // still seen in old emails / retained visitor hits — count as the property.
  if (
    (segments[0] === 'listings' || segments[0] === 'listing') &&
    segments[1]
  ) {
    const mlsId = decodeSegment(segments[1])
    return {
      kind: 'listing',
      contentKey: `listing:${mlsId}`,
      mlsId,
      path: `/listings/${mlsId}`,
      section: sectionAt(segments, 2),
    }
  }

  if (segments[0] === 'spotlight') {
    const tab = parseSpotlightPropertyTab(
      new URLSearchParams(rawSearch).get('property'),
    )
    const config = getSpotlightListingConfig(tab)
    const section = sectionAt(segments, 1)
    if (config.mlsId) {
      return {
        kind: 'listing',
        contentKey: `listing:${config.mlsId}`,
        mlsId: config.mlsId,
        path: `/listings/${config.mlsId}`,
        section,
      }
    }
    // Spotlight slots without an MLS id (Coming Soon panels) count as pages.
    return {
      kind: 'page',
      contentKey: `page:/spotlight?property=${tab}`,
      mlsId: null,
      path: `/spotlight?property=${tab}`,
      section,
    }
  }

  return {
    kind: 'page',
    contentKey: `page:${pathname}`,
    mlsId: null,
    path: pathname,
    section: null,
  }
}

/** One aggregated row for a viewed property or page. */
export type ContentViewSummary = {
  contentKey: string
  kind: ContentViewKind
  mlsId: string | null
  path: string
  views: number
  /** Distinct visitors, which reads truer than raw views on a small site. */
  viewers: number
  firstViewedAt: string
  lastViewedAt: string
  /** Present for listings still held in Postgres. */
  address?: string | null
  town?: string | null
  price?: number | null
  status?: string | null
}

/** Display name for a page row: friendly where known, path otherwise. */
export function contentViewPageLabel(path: string): string {
  const known = PAGE_LABELS[path]
  if (known) return known
  const spotlightTab = /^\/spotlight\?property=(\d)$/.exec(path)
  if (spotlightTab) return `Spotlight #${spotlightTab[1]}`
  // Belt-and-suspenders if a legacy singular path is still stored as kind=page.
  const legacyListing = /^\/listing\/([^/?#]+)/i.exec(path)
  if (legacyListing) {
    const id = decodeSegment(legacyListing[1]!)
    return id.length <= 16 ? `MLS ${id}` : `Listing ${id.slice(0, 8)}…`
  }
  return path
}

/** Display name for any row — property address when resolved, else the path. */
export function contentViewLabel(row: ContentViewSummary): string {
  if (row.kind === 'listing') {
    const address = row.address?.trim()
    if (address) return address
    return row.mlsId ? `MLS ${row.mlsId}` : row.path
  }
  return contentViewPageLabel(row.path)
}
