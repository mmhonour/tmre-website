/**
 * Spotlight Safety — single source of truth for Admin copy and resolve docs.
 * Keep free of server-only / DB imports (Admin panel is a client component).
 */

export const SPOTLIGHT_SAFETY_RULE_TITLE = 'Spotlight Safety'

/** One-line definition (glossary / callouts). */
export const SPOTLIGHT_SAFETY_RULE_SUMMARY =
  'Don’t let a stale Closed sale win over a live listing at the same address — not “never show Closed.”'

/**
 * Full published rule for Admin → Spotlight.
 * Assignment is MLS #-only; address auto-resolve is not used.
 */
export const SPOTLIGHT_SAFETY_RULE_BODY = [
  'Assign every Spotlight slot by MLS # only — not by street address. Blank = that tab is hidden.',
  'Admin pins accept any MLS status (Active, Coming Soon, Under Contract, Closed, Expired, Withdrawn, etc.). Pinning a Closed sale is intentional and allowed.',
  'Spotlight Safety means we do not auto-pick a listing from an address search: a stale Closed directory leftover must never displace a live listing you meant to feature. Enter the MLS # you want; when you save a different MLS #, that pin is promoted immediately (and we note if its MLS modification time is newer than the previous pin).',
  'Each MLS # may appear on only one Spotlight slot. Saving pulls missing listings from RETS into Postgres so the public page is ready without waiting for scheduled sync.',
].join(' ')
