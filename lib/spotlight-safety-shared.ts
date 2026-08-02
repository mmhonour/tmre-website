/**
 * Spotlight Admin rules — single source of truth for Admin → Spotlight copy.
 * Keep free of server-only / DB imports (Admin panel is a client component).
 */

export type SpotlightAdminRule = {
  id: string
  title: string
  summary: string
  body: string
}

export const SPOTLIGHT_SAFETY_RULE_TITLE = 'Spotlight Safety'

/** One-line definition (glossary / callouts). */
export const SPOTLIGHT_SAFETY_RULE_SUMMARY =
  'Don’t let a stale Closed sale win over a live listing at the same address — not “never show Closed.”'

/**
 * Full Spotlight Safety body (also first entry in {@link SPOTLIGHT_ADMIN_RULES}).
 */
export const SPOTLIGHT_SAFETY_RULE_BODY = [
  'Assign every Spotlight slot by MLS # only — not by street address. Blank = that tab is hidden.',
  'Admin pins accept any MLS status (Active, Coming Soon, Under Contract, Closed, Expired, Withdrawn, etc.). Pinning a Closed sale is intentional and allowed.',
  'Spotlight Safety means we do not auto-pick a listing from an address search: a stale Closed directory leftover must never displace a live listing you meant to feature. Enter the MLS # you want; when you save a different MLS #, that pin is promoted immediately (and we note if its MLS modification time is newer than the previous pin).',
  'Each MLS # may appear on only one Spotlight slot. Saving pulls missing listings from RETS into Postgres so the public page is ready without waiting for scheduled sync.',
].join(' ')

/** All published rules for Admin → Spotlight (order = display order). */
export const SPOTLIGHT_ADMIN_RULES: SpotlightAdminRule[] = [
  {
    id: 'safety',
    title: SPOTLIGHT_SAFETY_RULE_TITLE,
    summary: SPOTLIGHT_SAFETY_RULE_SUMMARY,
    body: SPOTLIGHT_SAFETY_RULE_BODY,
  },
  {
    id: 'mls-pin',
    title: 'MLS # assignment',
    summary:
      'Every slot is assigned by MLS # only — never by typing a street address.',
    body: [
      'Use the MLS # field on each Spotlight 1–5 card. There is no address search for assignment.',
      'Blank MLS # = that tab is hidden on the public Spotlight page.',
      'Saving a new MLS # replaces the previous pin for that slot immediately (promote). We show whether the new listing’s MLS modification time is newer or older than the prior pin.',
      'If the listing is not already in Postgres, we pull it from RETS once and write Postgres (and warm Spotlight cache) so the public page is ready without waiting for scheduled sync.',
    ].join(' '),
  },
  {
    id: 'any-status',
    title: 'Any MLS status',
    summary:
      'Admin may pin Active, Coming Soon, Under Contract, Closed, Expired, Withdrawn, and similar.',
    body: [
      'Status does not block a pin. Closed is allowed when you choose that MLS # on purpose.',
      'Spotlight Safety is about not auto-swapping a live listing for a stale Closed sale via address lookup — it is not a ban on featuring Closed.',
    ].join(' '),
  },
  {
    id: 'unique-mls',
    title: 'One MLS per slot',
    summary: 'The same MLS # cannot appear on two Spotlight slots at once.',
    body: [
      'Duplicates are rejected at save time with a conflict message naming the other slot.',
      'Clear or reassign one of the slots so each listing appears only once.',
    ].join(' '),
  },
  {
    id: 'display-order',
    title: 'Display order (stable slot ids)',
    summary:
      'Reorder the public rail without changing what Property #N means.',
    body: [
      '↑/↓ and Save order change only the left-to-right order of tab numbers on /spotlight.',
      'Property #5 stays #5 — same MLS, privacy toggles, analytics, and ?property=5 bookmarks. We do not swap MLS ids between slot numbers.',
      'Public pages poll /api/spotlight/tabs for a version stamp (~18s and on tab focus). On change they show “Spotlight order updating…” then refresh the rail and soft-refetch the current listing. No websockets.',
    ].join(' '),
  },
  {
    id: 'deep-links',
    title: 'Deep links & bookmarks',
    summary: '?property=N always means slot N, not “Nth visible tab.”',
    body: [
      'Slot 1 is /spotlight (no query). Slots 2–5 use ?property=2 … ?property=5.',
      'Changing display order does not break shared links: the number in the URL is the stable slot id.',
    ].join(' '),
  },
  {
    id: 'privacy',
    title: 'Privacy defaults',
    summary:
      'Toggles default off: address hidden, lead photos softened, town-level map.',
    body: [
      'Show address — street on the Spotlight header when checked.',
      'Show clear photos — turn off Coming Soon–style blur on photos 1 & 2 (and related soft presentation).',
      'Property map — pin / property-level map when checked; otherwise town outline / soft location.',
      'No longer Coming Soon — sticky: drop Coming Soon title/blur behavior even if MLS status still says Coming Soon. When MLS is already Active, that clear happens automatically.',
      'Privacy saves per slot automatically when you toggle.',
    ].join(' '),
  },
  {
    id: 'public-resolve',
    title: 'What the public page shows',
    summary:
      'Public Spotlight uses the Admin MLS pin for that slot (any status), then seed config, then cache — never address auto-pick.',
    body: [
      'Resolve order: Admin MLS override → hardcoded seed mlsId in code (until overridden) → prior resolved cache.',
      'Street address is not used to choose which MLS appears. Enter the MLS # you want featured.',
    ].join(' '),
  },
]
