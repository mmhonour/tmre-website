/** Shared site password for Admin and (later) other gated pages. */
export const SITE_PASSWORD = (
  process.env.SITE_PASSWORD?.trim() ||
  'TMRE1234'
)

/** HttpOnly cookie set after a successful password check. */
export const SITE_PASSWORD_COOKIE = 'tmre_site_pass'

/** Paths that should require the site password (add more as needed). */
export const SITE_PASSWORD_PROTECTED_PATHS = ['/admin', '/visitors'] as const

export function sitePasswordMatches(candidate: string | null | undefined): boolean {
  return Boolean(candidate) && candidate === SITE_PASSWORD
}

export function isProtectedSitePath(pathname: string): boolean {
  return SITE_PASSWORD_PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}
