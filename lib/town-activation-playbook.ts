/**
 * Canonical town-activation playbook — same stages for every town going forward.
 * Easton is the worked example; county expansion only widens who can enter Phase 0.
 * Rendered in Admin → CT coverage side panel (not a chat/canvas-only plan).
 */

export type TownActivationPhaseStatus = 'now' | 'built-later'

export type TownActivationPhase = {
  id: string
  phase: number
  title: string
  status: TownActivationPhaseStatus
  summary: string
  bullets: string[]
}

export type TownActivationSurfaceRow = {
  surface: string
  dependsOn: string
  notes: string
}

/** Phases 0–5 — Phase 0 is the only action the Activate checkbox performs today. */
export const TOWN_ACTIVATION_PHASES: readonly TownActivationPhase[] = [
  {
    id: 'phase-0',
    phase: 0,
    title: 'Activate flag',
    status: 'now',
    summary:
      'Checkbox writes ct_towns.active in Neon, highlights the map, and unlocks the Admin town-budget source row. No public site or RETS change.',
    bullets: [
      'Persists in Postgres only',
      'Budget URL row appears when active',
      'Does not add the town to Intelligence, Stats, DOTD, Latest, or incremental pulls',
    ],
  },
  {
    id: 'phase-1',
    phase: 1,
    title: 'Catalog & codes',
    status: 'built-later',
    summary:
      'Before RETS: confirm SmartMLS city code, ZCTAs, neighbors, schools, market tagline, Vision/assessor notes.',
    bullets: [
      'Store MLS code on ct_towns.mls_city_code (column exists)',
      'Seed currently has codes only for the live seven towns',
      'Per-town differences live here — not a different playbook',
    ],
  },
  {
    id: 'phase-2',
    phase: 2,
    title: 'Coverage → runtime',
    status: 'built-later',
    summary:
      'Public coverage reads active towns from Postgres (cached), not only the TMRE_TOWNS constant.',
    bullets: [
      'listActiveCtTownNames() (or snapshot) becomes the live set',
      'Keep compile-time fallback for the original seven until proven',
      'Touches filters, sync loops, stats keys, TmreTown unions',
    ],
  },
  {
    id: 'phase-3',
    phase: 3,
    title: 'RETS + warm',
    status: 'built-later',
    summary:
      'Incremental and Sync now include the town; first activation may need a one-shot backfill, then photo / board / stats_cache warm.',
    bullets: [
      'Modified-since alone is not enough on first enable',
      'Warm photos, deal board, stats_cache for the town',
    ],
  },
  {
    id: 'phase-4',
    phase: 4,
    title: 'Product surfaces',
    status: 'built-later',
    summary:
      'Wire every TMRE_TOWNS / town-pill consumer once the runtime list includes the town.',
    bullets: [
      'Home, Intelligence, Stats, Market Pulse, DOTD/DOTW, Latest',
      'Listings search, zip popovers, neighbor maps, email digests',
    ],
  },
  {
    id: 'phase-5',
    phase: 5,
    title: 'Go-live / public gate',
    status: 'built-later',
    summary:
      'Separate public flag from Activate so visitors never see a half-warmed board. Validate listings, scores, maps, and no regressions on live towns.',
    bullets: [
      'active = pipeline + Admin prep',
      'public = visitor pills / boards',
      'Validate before Make public',
    ],
  },
] as const

export const TOWN_ACTIVATION_SURFACES: readonly TownActivationSurfaceRow[] = [
  {
    surface: 'RETS incremental / Sync now',
    dependsOn: 'MLS city code + active (or public) set',
    notes: 'Scoped town picker lists the town',
  },
  {
    surface: 'Intelligence town pills / board',
    dependsOn: 'Runtime town list + board warm',
    notes: 'Scores/filters per town',
  },
  {
    surface: 'Stats / Market Pulse',
    dependsOn: 'stats_cache rebuild for town',
    notes: 'Months supply, inventory bars',
  },
  {
    surface: 'Deal of the Day / Week',
    dependsOn: 'DOTD cache slots for town',
    notes: 'May need FSSR / pick rules',
  },
  {
    surface: 'Zip / town hover maps',
    dependsOn: 'ZCTA rings for town zips',
    notes: 'Census boundaries already used elsewhere',
  },
  {
    surface: 'Neighbors / map context',
    dependsOn: 'TOWN_NEIGHBORS-style graph',
    notes: 'Update adjacency for that county',
  },
  {
    surface: 'Town budgets / Vision',
    dependsOn: 'active towns list (partially done)',
    notes: 'Paste official budget URL when ready',
  },
  {
    surface: 'Saved search / digests',
    dependsOn: 'Town enum in criteria',
    notes: 'Don’t break existing alerts',
  },
] as const

/** Optional worked-example notes (canonical playbook still applies to every town). */
const TOWN_EXAMPLE_NOTES: Record<string, string> = {
  Easton:
    'Worked example: Fairfield County · typical ZCTA 06612 · neighbors often include Redding, Weston, Fairfield, Trumbull, Monroe.',
}

export function townActivationExampleNote(townName: string): string | null {
  return TOWN_EXAMPLE_NOTES[townName.trim()] ?? null
}

export const TOWN_ACTIVATION_TODAY_WARNING =
  'Activate today only flips the Postgres flag (+ map / budget row). It does not wire RETS or public pages. Phases 1–5 are still build work.'
