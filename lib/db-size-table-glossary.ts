/**
 * One-line purpose for each Neon public table on Admin → Size & growth.
 * Unknown names fall back to a generic note so every row still has a popover.
 */

import { POSTGRES_KNOWN_TABLES } from '@/lib/postgres-known-tables'

const TABLE_PURPOSE: Record<(typeof POSTGRES_KNOWN_TABLES)[number], string> = {
  listings:
    'Live MLS inventory: one row per listing id, upserted in place by Incremental. Active, Closed, and other status buckets share this table.',
  sync_meta:
    'Key/value stamps the sync jobs read: last-finished clocks, locks, Configure schedule, pause flags, and this Size & growth snapshot.',
  sync_queue:
    'Durable work queue. Thin crons enqueue a due job; the Railway runner claims a row and forks a child. Admin Syncs shows waiting / running / recent.',
  stats_cache:
    'Precomputed town × sale/rental market payloads (medians, histograms, months supply, closed-daily counts). Rebuilt by the stats-cache job.',
  market_pulse_snapshots:
    'Weekly Market Pulse / Monday brief archive. One row per Eastern send-day so later briefs can show WoW / MoM / YoY. Not overwritten by the stats rebuild.',
  listing_tax_history:
    'Historical CT property-tax years from CAMA assessments × mill rates. Current fiscal year stays MLS-reported; Norwalk is skipped.',
  listing_if_estimates:
    'What-if sale/rent amounts and sold/active counts per listing, used by the comparables / If surfaces.',
  listing_location_estimates:
    'Current coastal / town-center location-value estimate per listing.',
  listing_location_estimate_snapshots:
    'Historical snapshots of those location estimates so a later rebuild can show movement.',
  listing_relations:
    'Ranked sold and active comparables for each subject listing.',
  listing_edge_scores:
    'Comp-ranking edge score per listing (Sync 3b). Used to order comparable fit.',
  listing_superlatives:
    'Cached “best of” flags (price, size, score) so listing cards do not recompute them.',
  listing_price_history:
    'Ask→ask price moves with timestamps. Latest Reduced/Increased copy also lives in stats_cache.',
  listing_photo_index:
    'Which photos exist for a listing (R2 keys / order), not the image bytes themselves.',
  open_houses:
    'SmartMLS OpenHouse rows: upcoming window replace plus a year of history for /open-houses.',
  town_property_addresses:
    'List With Me address catalog (thinner than the Vision parcel map). Autocomplete and street matching.',
  vision_addresses:
    'VGSI cadastral index: Field Card PIDs, owners, and street matches used to stamp listings.vision_pid.',
  vision_streets:
    'Official VGSI street-name index per town, filled letter-by-letter from Streets.aspx.',
  vision_street_parcels:
    'House numbers on those Vision streets. Street-listings walks rows that still lack an MLS link.',
  zip_boundaries:
    'Census TIGERweb ZCTA rings for Intelligence / Latest maps.',
  visitors:
    'Anonymous / identified site visitors (pageviews, optional contact) for Admin visitor stats.',
  content_views:
    'Per-page view events used to attribute visitor activity.',
  fomc_meetings:
    'Official FOMC statements scraped on decision day for /fed-analysis.',
  cpi_releases:
    'Official BLS CPI news-release text scraped on print day for /fed-analysis.',
  mortgage_rates:
    'Stored mortgage-rate series shown on market / Fed surfaces.',
  nar_housing:
    'NAR housing-market series stored for market context.',
  khe_pta_households:
    'KHE PTA household rows used by that research / outreach surface.',
  people:
    'CRM people records (contacts distinct from site_users).',
  leads:
    'Inbound lead records from public forms.',
  site_users:
    'Signed-in site accounts (magic-link users).',
  site_user_magic_links:
    'One-time sign-in tokens for site_users.',
  site_user_sessions:
    'Active site-user sessions after a magic link is redeemed.',
  saved_search_alerts:
    'Visitor listing-alert subscriptions (filters + delivery prefs).',
  saved_search_alert_deliveries:
    'Which alert emails have already gone out, so the same listing is not re-sent.',
  sync_runs:
    'Audit log of sync jobs (start/finish, town, counts, errors) shown on Admin History.',
  schema_migrations:
    'Which db/migrations/*.sql files have been applied to this Neon database.',
}

const UNKNOWN_PURPOSE =
  'Undocumented public table — not in the known Neon inventory. Live discovery still lists it so size is visible.'

export function tablePurposeFor(table: string): string {
  if (table in TABLE_PURPOSE) {
    return TABLE_PURPOSE[table as keyof typeof TABLE_PURPOSE]
  }
  return UNKNOWN_PURPOSE
}
