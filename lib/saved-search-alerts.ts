import 'server-only'

import { randomUUID } from 'node:crypto'
import { query } from '@/lib/db/postgres'
import { SITE_URL } from '@/lib/business-info'
import { isValidEmail } from '@/lib/contact-notify-config'
import { normalizePhoneDigits } from '@/lib/business-info'
import {
  fingerprintCriteria,
  labelCriteria,
  townsForCriteria,
  type VisitorSearchCriteria,
} from '@/lib/visitor-search-profile'
import {
  notifySavedSearchByEmail,
  notifySavedSearchConfirmation,
  type SavedSearchMatchListing,
} from '@/lib/saved-search-notify'

export type AlertChannel = 'email' | 'sms'
export type AlertCadence = 'immediate' | 'daily' | 'weekly'

export type SavedSearchAlert = {
  id: string
  visitorId: string | null
  criteria: VisitorSearchCriteria
  criteriaFingerprint: string
  criteriaLabel: string
  channel: AlertChannel
  email: string | null
  phone: string | null
  cadence: AlertCadence
  dailyTimeEt: string | null
  weeklyDay: number | null
  weeklyTimeEt: string | null
  active: boolean
  lastNotifiedAt: string | null
  createdAt: string
}

let ensured = false

/** Ensure alert tables exist (idempotent; complements db/migrations/0004). */
export async function ensureSavedSearchAlertTables(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS saved_search_alerts (
      id                   text PRIMARY KEY,
      visitor_id           text,
      criteria             jsonb NOT NULL,
      criteria_fingerprint text NOT NULL,
      criteria_label       text NOT NULL,
      channel              text NOT NULL CHECK (channel IN ('email', 'sms')),
      email                text,
      phone                text,
      cadence              text NOT NULL CHECK (cadence IN ('immediate', 'daily', 'weekly')),
      daily_time_et        text,
      weekly_day           smallint,
      weekly_time_et       text,
      active               boolean NOT NULL DEFAULT true,
      last_notified_at     timestamptz,
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS saved_search_alert_deliveries (
      alert_id   text NOT NULL REFERENCES saved_search_alerts(id) ON DELETE CASCADE,
      listing_id text NOT NULL,
      channel    text NOT NULL,
      sent_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (alert_id, listing_id)
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_saved_search_alerts_active_cadence
      ON saved_search_alerts (active, cadence)
      WHERE active = true
  `)
  ensured = true
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

export function isValidTimeEt(value: string): boolean {
  return TIME_RE.test(value.trim())
}

export type CreateSavedSearchAlertInput = {
  visitorId?: string | null
  criteria: VisitorSearchCriteria
  channel: AlertChannel
  email?: string | null
  phone?: string | null
  cadence: AlertCadence
  dailyTimeEt?: string | null
  weeklyDay?: number | null
  weeklyTimeEt?: string | null
}

export async function createSavedSearchAlert(
  input: CreateSavedSearchAlertInput,
): Promise<SavedSearchAlert> {
  await ensureSavedSearchAlertTables()

  if (input.channel === 'sms') {
    throw new Error(
      'Text alerts are not available yet — choose email, or see the SMS plan whiteboard',
    )
  }
  const email = input.email?.trim().toLowerCase() ?? null
  if (!email || !isValidEmail(email)) {
    throw new Error('A valid email address is required')
  }

  if (input.cadence === 'daily') {
    if (!input.dailyTimeEt || !isValidTimeEt(input.dailyTimeEt)) {
      throw new Error('Daily alerts need a time (HH:MM, Eastern)')
    }
  }
  if (input.cadence === 'weekly') {
    if (
      input.weeklyDay == null ||
      input.weeklyDay < 0 ||
      input.weeklyDay > 6 ||
      !input.weeklyTimeEt ||
      !isValidTimeEt(input.weeklyTimeEt)
    ) {
      throw new Error('Weekly alerts need a weekday and time (Eastern)')
    }
  }

  const criteria = input.criteria
  const id = randomUUID()
  const fingerprint = fingerprintCriteria(criteria)
  const label = labelCriteria(criteria)
  const dailyTime = input.cadence === 'daily' ? input.dailyTimeEt!.trim() : null
  const weeklyDay = input.cadence === 'weekly' ? input.weeklyDay! : null
  const weeklyTime =
    input.cadence === 'weekly' ? input.weeklyTimeEt!.trim() : null

  await query(
    `INSERT INTO saved_search_alerts (
       id, visitor_id, criteria, criteria_fingerprint, criteria_label,
       channel, email, phone, cadence, daily_time_et, weekly_day, weekly_time_et
     ) VALUES (
       $1, $2, $3::jsonb, $4, $5,
       $6, $7, $8, $9, $10, $11, $12
     )`,
    [
      id,
      input.visitorId?.trim() || null,
      JSON.stringify(criteria),
      fingerprint,
      label,
      'email',
      email,
      null,
      input.cadence,
      dailyTime,
      weeklyDay,
      weeklyTime,
    ],
  )

  const cadenceLabel =
    input.cadence === 'immediate'
      ? 'As soon as a new match appears (checked every ~30 minutes)'
      : input.cadence === 'daily'
        ? `Once a day at ${dailyTime} ET`
        : `Once a week (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weeklyDay!]}) at ${weeklyTime} ET`

  void notifySavedSearchConfirmation({
    to: email,
    criteriaLabel: label,
    cadenceLabel,
  }).catch((err) => {
    console.warn('[saved-search-alerts] confirmation email failed', err)
  })

  return {
    id,
    visitorId: input.visitorId?.trim() || null,
    criteria,
    criteriaFingerprint: fingerprint,
    criteriaLabel: label,
    channel: 'email',
    email,
    phone: null,
    cadence: input.cadence,
    dailyTimeEt: dailyTime,
    weeklyDay,
    weeklyTimeEt: weeklyTime,
    active: true,
    lastNotifiedAt: null,
    createdAt: new Date().toISOString(),
  }
}

type AlertRow = {
  id: string
  visitor_id: string | null
  criteria: VisitorSearchCriteria | string
  criteria_fingerprint: string
  criteria_label: string
  channel: AlertChannel
  email: string | null
  phone: string | null
  cadence: AlertCadence
  daily_time_et: string | null
  weekly_day: number | null
  weekly_time_et: string | null
  active: boolean
  last_notified_at: string | null
  created_at: string
}

function mapRow(row: AlertRow): SavedSearchAlert {
  const criteria =
    typeof row.criteria === 'string'
      ? (JSON.parse(row.criteria) as VisitorSearchCriteria)
      : row.criteria
  return {
    id: row.id,
    visitorId: row.visitor_id,
    criteria,
    criteriaFingerprint: row.criteria_fingerprint,
    criteriaLabel: row.criteria_label,
    channel: row.channel,
    email: row.email,
    phone: row.phone,
    cadence: row.cadence,
    dailyTimeEt: row.daily_time_et,
    weeklyDay: row.weekly_day,
    weeklyTimeEt: row.weekly_time_et,
    active: row.active,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
  }
}

async function loadActiveAlerts(cadence?: AlertCadence): Promise<SavedSearchAlert[]> {
  await ensureSavedSearchAlertTables()
  const rows = cadence
    ? await query<AlertRow>(
        `SELECT * FROM saved_search_alerts
         WHERE active = true AND channel = 'email' AND cadence = $1`,
        [cadence],
      )
    : await query<AlertRow>(
        `SELECT * FROM saved_search_alerts
         WHERE active = true AND channel = 'email'`,
      )
  return rows.map(mapRow)
}

type ListingMatchRow = {
  id: string
  mls_id: string
  address_full: string | null
  address_street: string | null
  town: string | null
  price: string | number | null
  beds: string | number | null
  baths: string | number | null
  listing_key: string | null
}

function toMatchListing(row: ListingMatchRow): SavedSearchMatchListing {
  const mlsId = row.mls_id
  const key = row.listing_key?.trim() || mlsId
  return {
    id: row.id,
    mlsId,
    address: row.address_full || row.address_street || null,
    town: row.town,
    price: row.price != null ? Number(row.price) : null,
    beds: row.beds != null ? Number(row.beds) : null,
    baths: row.baths != null ? Number(row.baths) : null,
    href: `/listing/${encodeURIComponent(key)}`,
  }
}

/**
 * Find Active listings matching criteria that look "new" since `sinceIso`
 * and have not already been delivered for this alert.
 *
 * "New" = list_date after since, OR DOM ≤ 7 with modification after since.
 */
export async function findMatchingNewListings(
  alert: SavedSearchAlert,
  sinceIso: string,
  limit = 25,
): Promise<SavedSearchMatchListing[]> {
  const c = alert.criteria
  const params: unknown[] = [alert.id, sinceIso]
  const conditions: string[] = [
    `l.status_bucket = 'Active'`,
    `(
       (l.list_date IS NOT NULL AND l.list_date > $2::timestamptz)
       OR (
         l.dom IS NOT NULL AND l.dom <= 7
         AND l.modification_timestamp IS NOT NULL
         AND l.modification_timestamp > $2::timestamptz
       )
     )`,
    `NOT EXISTS (
       SELECT 1 FROM saved_search_alert_deliveries d
       WHERE d.alert_id = $1 AND d.listing_id = l.id
     )`,
  ]

  const towns = townsForCriteria(c)
  if (towns.length > 0) {
    params.push(towns)
    conditions.push(`l.town = ANY($${params.length}::text[])`)
  }
  if (c.zip) {
    params.push(c.zip)
    conditions.push(`l.postal_code = $${params.length}`)
  }
  if (c.minBeds != null) {
    params.push(c.minBeds)
    conditions.push(`l.beds IS NOT NULL AND l.beds >= $${params.length}`)
  }
  if (c.maxBeds != null) {
    params.push(c.maxBeds)
    conditions.push(`l.beds IS NOT NULL AND l.beds <= $${params.length}`)
  }
  if (c.minBaths != null) {
    params.push(c.minBaths)
    conditions.push(`l.baths IS NOT NULL AND l.baths >= $${params.length}`)
  }
  if (c.maxBaths != null) {
    params.push(c.maxBaths)
    conditions.push(`l.baths IS NOT NULL AND l.baths <= $${params.length}`)
  }
  if (c.tx === 'rental') {
    conditions.push(
      `(l.property_type ILIKE '%rent%' OR l.mls_status ILIKE '%rent%' OR COALESCE(l.data->>'transactionType','') ILIKE '%rent%')`,
    )
  } else if (c.tx === 'sale') {
    conditions.push(
      `(l.property_type IS NULL OR l.property_type NOT ILIKE '%rent%')`,
    )
  }
  if (c.newConstruction === true) {
    conditions.push(
      `(COALESCE(l.data->>'isNewConstruction','') IN ('true','1','yes')
        OR l.year_built IS NOT NULL AND l.year_built >= EXTRACT(YEAR FROM CURRENT_DATE) - 2)`,
    )
  }

  params.push(limit)
  const sql = `
    SELECT l.id, l.mls_id, l.address_full, l.address_street, l.town,
           l.price, l.beds, l.baths, l.listing_key
    FROM listings l
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(l.list_date, l.modification_timestamp) DESC NULLS LAST
    LIMIT $${params.length}
  `
  const rows = await query<ListingMatchRow>(sql, params)
  return rows.map(toMatchListing)
}

function etParts(d = new Date()): {
  weekday: number
  minutes: number
  hhmm: string
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(d)
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { weekday: map[wd] ?? 0, minutes: hour * 60 + minute, hhmm }
}

function parseHhmmToMinutes(hhmm: string): number {
  const m = TIME_RE.exec(hhmm.trim())
  if (!m) return -1
  return Number(m[1]) * 60 + Number(m[2])
}

/** True when ET clock is within [scheduled, scheduled+window) minutes. */
function isInScheduleWindow(
  scheduledHhmm: string,
  windowMinutes = 30,
): boolean {
  const target = parseHhmmToMinutes(scheduledHhmm)
  if (target < 0) return false
  const { minutes: now } = etParts()
  return now >= target && now < target + windowMinutes
}

async function markDelivered(
  alertId: string,
  listings: SavedSearchMatchListing[],
  channel: AlertChannel,
): Promise<void> {
  for (const listing of listings) {
    await query(
      `INSERT INTO saved_search_alert_deliveries (alert_id, listing_id, channel)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [alertId, listing.id, channel],
    )
  }
  await query(
    `UPDATE saved_search_alerts
     SET last_notified_at = now(), updated_at = now()
     WHERE id = $1`,
    [alertId],
  )
}

async function deliverAlert(
  alert: SavedSearchAlert,
  listings: SavedSearchMatchListing[],
): Promise<number> {
  if (!alert.email || listings.length === 0) return 0
  const ok = await notifySavedSearchByEmail({
    to: alert.email,
    criteriaLabel: alert.criteriaLabel,
    cadence: alert.cadence,
    listings,
  })
  if (!ok) return 0
  await markDelivered(alert.id, listings, 'email')
  return listings.length
}

/**
 * Process due alerts after an MLS incremental sync.
 * - immediate: any new matches since last notify / created
 * - daily / weekly: only when ET schedule window matches (cron is ~30 min)
 */
export async function processDueSavedSearchAlerts(): Promise<{
  checked: number
  sent: number
  listings: number
}> {
  try {
    await ensureSavedSearchAlertTables()
  } catch (err) {
    console.warn('[saved-search-alerts] ensure tables failed', err)
    return { checked: 0, sent: 0, listings: 0 }
  }

  const alerts = await loadActiveAlerts()
  const { weekday } = etParts()
  let sent = 0
  let listingCount = 0

  for (const alert of alerts) {
    try {
      if (alert.cadence === 'daily') {
        if (!alert.dailyTimeEt || !isInScheduleWindow(alert.dailyTimeEt)) continue
      } else if (alert.cadence === 'weekly') {
        if (
          alert.weeklyDay == null ||
          alert.weeklyDay !== weekday ||
          !alert.weeklyTimeEt ||
          !isInScheduleWindow(alert.weeklyTimeEt)
        ) {
          continue
        }
      }

      // Daily/weekly: avoid double-sends inside the same 30-minute cron window.
      // Immediate uses per-listing delivery rows for dedupe instead.
      if (alert.cadence !== 'immediate' && alert.lastNotifiedAt) {
        const ageMs = Date.now() - new Date(alert.lastNotifiedAt).getTime()
        if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 35 * 60 * 1000) {
          continue
        }
      }

      const since =
        alert.lastNotifiedAt ||
        alert.createdAt ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const matches = await findMatchingNewListings(alert, since)
      if (matches.length === 0) continue
      const n = await deliverAlert(alert, matches)
      if (n > 0) {
        sent += 1
        listingCount += n
      }
    } catch (err) {
      console.warn('[saved-search-alerts] process alert failed', alert.id, err)
    }
  }

  return { checked: alerts.length, sent, listings: listingCount }
}

/** Validate phone shape for future SMS (not used for delivery yet). */
export function isValidAlertPhone(value: string): boolean {
  return normalizePhoneDigits(value).length === 10
}

export function absoluteListingUrl(href: string): string {
  return href.startsWith('http') ? href : `${SITE_URL}${href}`
}
