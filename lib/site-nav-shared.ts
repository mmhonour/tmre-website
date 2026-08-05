/**
 * Public header nav config (client-safe).
 * Admin can rename / reorder / show-hide / add / remove; hrefs stay fixed to
 * known site pages (lib/site-pages.ts) so a menu edit cannot create a 404.
 */

import {
  customNavIdForPath,
  findSitePage,
  SITE_PAGES,
  type SitePage,
} from '@/lib/site-pages'

export type SiteNavLinkFlags = {
  bold?: boolean
  bolt?: boolean
  magnifier?: boolean
  requiresUnlock?: boolean
}

export type SiteNavTopLink = {
  kind: 'link'
  id: string
  href: string
  label: string
  visible: boolean
  /** Added by Admin rather than shipped in the catalog below. */
  custom?: true
} & SiteNavLinkFlags

export type SiteNavTopExplore = {
  kind: 'explore'
  id: 'explore'
  label: string
  visible: boolean
}

export type SiteNavTopItem = SiteNavTopLink | SiteNavTopExplore

export type SiteNavExploreLink = {
  id: string
  href: string
  label: string
  visible: boolean
  requiresUnlock?: boolean
  /** Added by Admin rather than shipped in the catalog below. */
  custom?: true
}

export type SiteNavExploreGroup = {
  id: string
  title: string
  visible: boolean
  links: SiteNavExploreLink[]
}

export type SiteNavConfig = {
  topLevel: SiteNavTopItem[]
  exploreGroups: SiteNavExploreGroup[]
}

const DEFAULT_TOP: SiteNavTopItem[] = [
  {
    kind: 'link',
    id: 'deal-of-the-day',
    href: '/deal-of-the-day',
    label: 'Deal of the Day',
    visible: true,
    bold: true,
  },
  {
    kind: 'link',
    id: 'intelligence',
    href: '/intelligence',
    label: 'Intelligence',
    visible: true,
    bolt: true,
  },
  {
    kind: 'link',
    id: 'spotlight',
    href: '/spotlight',
    label: 'Spotlight',
    visible: true,
  },
  {
    kind: 'link',
    id: 'lookey',
    href: '/lookey',
    label: 'Looked at...',
    visible: true,
    magnifier: true,
  },
  {
    kind: 'link',
    id: 'list-with-me',
    href: '/list-with-me',
    label: 'List With Me',
    visible: true,
  },
  { kind: 'explore', id: 'explore', label: 'Explore', visible: true },
]

const DEFAULT_EXPLORE: SiteNavExploreGroup[] = [
  {
    id: 'properties',
    title: 'Properties',
    visible: true,
    links: [
      { id: 'latest', href: '/latest', label: 'Latest', visible: true },
      {
        id: 'open-houses',
        href: '/open-houses',
        label: 'Open Houses',
        visible: true,
      },
      {
        id: 'new-construction',
        href: '/new-construction',
        label: 'New Construction',
        visible: true,
      },
      {
        id: 'expired-listings',
        href: '/new-construction/expired-listings',
        label: 'Expired Listings',
        visible: true,
      },
      {
        id: 'fixer-uppers',
        href: '/fixer-uppers',
        label: 'Fixer Uppers',
        visible: true,
      },
      { id: 'find', href: '/find', label: 'Find', visible: true },
    ],
  },
  {
    id: 'research',
    title: 'Research',
    visible: true,
    links: [
      { id: 'stats', href: '/stats', label: 'Stats', visible: true },
      {
        id: 'mortgage-rates',
        href: '/mortgage-rates',
        label: 'Mortgage Rates',
        visible: true,
      },
      {
        id: 'town-budget',
        href: '/town-budget',
        label: 'Town Budget',
        visible: true,
      },
      { id: 'score', href: '/score', label: 'Score', visible: true },
      {
        id: 'owner-history',
        href: '/owner-history',
        label: 'Owner History',
        visible: true,
      },
    ],
  },
]

export const DEFAULT_SITE_NAV: SiteNavConfig = {
  topLevel: DEFAULT_TOP,
  exploreGroups: DEFAULT_EXPLORE,
}

function clampLabel(raw: unknown, fallback: string, max = 48): string {
  if (typeof raw !== 'string') return fallback
  const t = raw.trim().slice(0, max)
  return t || fallback
}

function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

/**
 * An Admin-added row has no catalog fallback, so its href comes from the stored
 * value — and is only kept when it resolves to a real page in SITE_PAGES. That
 * keeps "hrefs are always valid" true while still allowing additions.
 */
function normalizeCustomNavLink(
  raw: Record<string, unknown>,
  id: string,
  used: Set<string>,
): SiteNavExploreLink | null {
  if (raw.custom !== true) return null
  const href = typeof raw.href === 'string' ? raw.href : ''
  const page = findSitePage(href)
  if (!page) return null
  const candidate = /^[a-z0-9-]{1,64}$/.test(id)
    ? id
    : customNavIdForPath(page.path)
  if (used.has(candidate)) return null
  return {
    id: candidate,
    href: page.path,
    label: clampLabel(raw.label, page.label),
    visible: asBool(raw.visible, true),
    custom: true,
  }
}

/** Pages not already linked anywhere in the menu — the Add page picker list. */
export function siteNavAddablePages(config: SiteNavConfig): SitePage[] {
  const used = new Set<string>()
  for (const item of config.topLevel) {
    if (item.kind === 'link') used.add(item.href)
  }
  for (const group of config.exploreGroups) {
    for (const link of group.links) used.add(link.href)
  }
  return SITE_PAGES.filter((page) => !used.has(page.path))
}

/** New menu row for a picked page (Admin “Add page”). */
export function siteNavLinkForPage(page: SitePage): SiteNavExploreLink {
  return {
    id: customNavIdForPath(page.path),
    href: page.path,
    label: page.label,
    visible: true,
    custom: true,
  }
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>()
  for (const row of rows) m.set(row.id, row)
  return m
}

/**
 * Merge stored JSON onto the canonical catalog.
 * Unknown ids dropped; missing catalog items appended; hrefs always from defaults.
 */
export function normalizeSiteNav(raw: unknown): SiteNavConfig {
  const defaults = structuredClone(DEFAULT_SITE_NAV)
  if (!raw || typeof raw !== 'object') return defaults

  const o = raw as {
    topLevel?: unknown
    exploreGroups?: unknown
  }

  const incomingTop = Array.isArray(o.topLevel) ? o.topLevel : []
  const defaultTopById = indexById(defaults.topLevel)
  const usedTop = new Set<string>()
  const topLevel: SiteNavTopItem[] = []

  for (const row of incomingTop) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    const fallback = defaultTopById.get(id)
    if (!fallback) {
      const added = normalizeCustomNavLink(r, id, usedTop)
      if (added) {
        usedTop.add(added.id)
        topLevel.push({ kind: 'link', ...added })
      }
      continue
    }
    if (usedTop.has(id)) continue
    usedTop.add(id)
    if (fallback.kind === 'explore') {
      topLevel.push({
        kind: 'explore',
        id: 'explore',
        label: clampLabel(r.label, fallback.label),
        visible: asBool(r.visible, fallback.visible),
      })
    } else {
      topLevel.push({
        kind: 'link',
        id: fallback.id,
        href: fallback.href,
        label: clampLabel(r.label, fallback.label),
        visible: asBool(r.visible, fallback.visible),
        ...(fallback.bold ? { bold: true } : {}),
        ...(fallback.bolt ? { bolt: true } : {}),
        ...(fallback.magnifier ? { magnifier: true } : {}),
        ...(fallback.requiresUnlock ? { requiresUnlock: true } : {}),
      })
    }
  }
  for (const item of defaults.topLevel) {
    if (!usedTop.has(item.id)) topLevel.push({ ...item })
  }

  const incomingGroups = Array.isArray(o.exploreGroups) ? o.exploreGroups : []
  const defaultGroupById = indexById(defaults.exploreGroups)
  const usedGroups = new Set<string>()
  const exploreGroups: SiteNavExploreGroup[] = []

  for (const gRow of incomingGroups) {
    if (!gRow || typeof gRow !== 'object') continue
    const g = gRow as Record<string, unknown>
    const gid = typeof g.id === 'string' ? g.id : ''
    const gFallback = defaultGroupById.get(gid)
    if (!gFallback || usedGroups.has(gid)) continue
    usedGroups.add(gid)

    const defaultLinkById = indexById(gFallback.links)
    const incomingLinks = Array.isArray(g.links) ? g.links : []
    const usedLinks = new Set<string>()
    const links: SiteNavExploreLink[] = []

    for (const lRow of incomingLinks) {
      if (!lRow || typeof lRow !== 'object') continue
      const l = lRow as Record<string, unknown>
      const lid = typeof l.id === 'string' ? l.id : ''
      const lFallback = defaultLinkById.get(lid)
      if (!lFallback) {
        const added = normalizeCustomNavLink(l, lid, usedLinks)
        if (added) {
          usedLinks.add(added.id)
          links.push(added)
        }
        continue
      }
      if (usedLinks.has(lid)) continue
      usedLinks.add(lid)
      links.push({
        id: lFallback.id,
        href: lFallback.href,
        label: clampLabel(l.label, lFallback.label),
        visible: asBool(l.visible, lFallback.visible),
        ...(lFallback.requiresUnlock ? { requiresUnlock: true } : {}),
      })
    }
    for (const link of gFallback.links) {
      if (!usedLinks.has(link.id)) links.push({ ...link })
    }

    exploreGroups.push({
      id: gFallback.id,
      title: clampLabel(g.title, gFallback.title, 40),
      visible: asBool(g.visible, gFallback.visible),
      links,
    })
  }
  for (const group of defaults.exploreGroups) {
    if (!usedGroups.has(group.id)) {
      exploreGroups.push(structuredClone(group))
    }
  }

  return { topLevel, exploreGroups }
}

export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const next = index + delta
  if (index < 0 || index >= items.length || next < 0 || next >= items.length) {
    return items
  }
  const copy = items.slice()
  const [row] = copy.splice(index, 1)
  copy.splice(next, 0, row!)
  return copy
}

/** Visible explore groups/links for the public header (unlock filter applied). */
export function resolvePublicExploreGroups(
  config: SiteNavConfig,
  siteUnlocked: boolean,
): { title: string; links: { href: string; label: string }[] }[] {
  return config.exploreGroups
    .filter((g) => g.visible)
    .map((g) => ({
      title: g.title,
      links: g.links
        .filter(
          (l) =>
            l.visible && (!l.requiresUnlock || siteUnlocked),
        )
        .map((l) => ({ href: l.href, label: l.label })),
    }))
    .filter((g) => g.links.length > 0)
}
