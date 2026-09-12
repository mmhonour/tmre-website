/**
 * The site header is fixed with no spacer beneath it, and its height changes
 * with signed-in chrome, so a fixed scroll-margin cannot reliably clear it.
 * Measure the live header instead.
 */

/** Breathing room between the header's bottom edge and the jump target. */
const GUTTER_PX = 16
/** Used before the header can be measured, and as the CSS fallback. */
const FALLBACK_PX = 112

export const HEADER_SCROLL_OFFSET_VAR = '--header-scroll-offset'

/**
 * Tailwind class every header-clearing hash target uses.
 * Keep this a full literal so the scanner sees the utility.
 */
export const HEADER_SCROLL_MT =
  'scroll-mt-[var(--header-scroll-offset,7rem)]'

export function headerScrollOffsetPx(): number {
  if (typeof document === 'undefined') return FALLBACK_PX + GUTTER_PX
  const header = document.querySelector('header')
  const bottom = header?.getBoundingClientRect().bottom ?? 0
  return (bottom > 0 ? bottom : FALLBACK_PX) + GUTTER_PX
}

export function publishHeaderScrollOffset(): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(
    HEADER_SCROLL_OFFSET_VAR,
    `${headerScrollOffsetPx()}px`,
  )
}
