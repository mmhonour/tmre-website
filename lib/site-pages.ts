/**
 * Canonical list of stable public pages (client-safe, no imports).
 *
 * Single source for two consumers:
 *   - app/sitemap.ts        — /sitemap.xml
 *   - lib/site-nav-shared.ts — the Add page picker in Admin → Web server → Site menu
 *
 * Add a page here once and it becomes both crawlable and menu-addable. Dynamic
 * listing routes stay out on purpose: too many, and discoverable via links.
 */

export type SitePageChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

export type SitePage = {
  path: string
  /** Default menu label when this page is added to the header nav. */
  label: string
  priority: number
  changeFrequency: SitePageChangeFrequency
}

export const SITE_PAGES: readonly SitePage[] = [
  { path: '/', label: 'Home', priority: 1.0, changeFrequency: 'daily' },
  { path: '/about', label: 'About', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/contact', label: 'Contact', priority: 0.8, changeFrequency: 'yearly' },
  { path: '/stats', label: 'Stats', priority: 0.7, changeFrequency: 'daily' },
  {
    path: '/new-construction',
    label: 'New Construction',
    priority: 0.6,
    changeFrequency: 'weekly',
  },
  { path: '/investors', label: 'Investors', priority: 0.6, changeFrequency: 'weekly' },
  {
    path: '/open-houses',
    label: 'Open Houses',
    priority: 0.6,
    changeFrequency: 'daily',
  },
  { path: '/find', label: 'Find', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/latest', label: 'Latest', priority: 0.6, changeFrequency: 'daily' },
  {
    path: '/list-with-me',
    label: 'List With Me',
    priority: 0.6,
    changeFrequency: 'monthly',
  },
  {
    path: '/mortgage-rates',
    label: 'Mortgage Rates',
    priority: 0.6,
    changeFrequency: 'weekly',
  },
  { path: '/privacy', label: 'Privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', label: 'Terms', priority: 0.3, changeFrequency: 'yearly' },
]

export function findSitePage(path: string): SitePage | null {
  const clean = path.trim()
  return SITE_PAGES.find((page) => page.path === clean) ?? null
}

/** Stable nav id for an admin-added page — `page-` prefixed so it cannot
 *  collide with a catalog id in lib/site-nav-shared.ts. */
export function customNavIdForPath(path: string): string {
  const slug = path
    .replace(/^\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `page-${slug || 'home'}`
}
