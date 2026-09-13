import 'server-only'

import { randomUUID } from 'node:crypto'
import { query } from '@/lib/db/postgres'
import {
  absoluteUrl,
  normalizePhoneDigits,
  SITE_URL,
} from '@/lib/business-info'
import { isValidEmail } from '@/lib/contact-notify-config'
import { intelligenceSearchHrefFromCriteria } from '@/lib/intelligence-search-url'
import { listingPhotoProxyUrl, listingShareHref } from '@/lib/listing-url'
import { etCalendarDate } from '@/lib/open-houses'
import { ensureOpenHousesTable } from '@/lib/db/open-houses-repo'
import {
  criteriaNotifySummary,
  criteriaWantsListingAlerts,
  criteriaWantsOpenHouseAlerts,
  fingerprintCriteria,
  labelCriteria,
  normalizeVisitorSearchCriteria,
  townsForCriteria,
  type VisitorSearchCriteria,
} from '@/lib/visitor-search-profile'
import {
  notifySavedSearchByEmail,
  notifySavedSearchConfirmation,
  notifySavedSearchCreatedAdmin,
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
      event_kind text NOT NULL DEFAULT 'listing',
      sent_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (alert_id, listing_id, event_kind)
    )
  `)
  await query(`
    ALTER TABLE saved_search_alert_deliveries
      ADD COLUMN IF NOT EXISTS event_kind text NOT NULL DEFAULT 'listing'
  `)
  await query(`
    ALTER TABLE saved_search_alert_deliveries
      DROP CONSTRAINT IF EXISTS saved_search_alert_deliveries_pkey
  `)
  await query(`
    ALTER TABLE saved_search_alert_deliveries
      ADD CONSTRAINT saved_search_alert_deliveries_pkey
      PRIMARY KEY (alert_id, listing_id, event_kind)
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

  const criteria = normalizeVisitorSearchCriteria(input.criteria)
  if (
    !criteriaWantsListingAlerts(criteria) &&
    !criteriaWantsOpenHouseAlerts(criteria)
  ) {
    throw new Error('Choose listing alerts, open house alerts, or both')
  }
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

  const notifyWhat = criteriaNotifySummary(criteria)
  const cadenceLabel =
    input.cadence === 'immediate'
      ? `As soon as ${notifyWhat} match (checked every ~30 minutes)`
      : input.cadence === 'daily'
        ? `Once a day at ${dailyTime} ET when ${notifyWhat} match`
        : `Once a week (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weeklyDay!]}) at ${weeklyTime} ET when ${notifyWhat} match`

  if (criteriaWantsOpenHouseAlerts(criteria)) {
    try {
      const seedAlert: SavedSearchAlert = {
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
      const alreadyOpen = await findMatchingOpenHouseListings(seedAlert, {
        ignoreDeliveries: true,
      })
      await markDelivered(id, alreadyOpen, 'email', 'open_house', {
        touchLastNotified: false,
      })
    } catch (err) {
      console.warn('[saved-search-alerts] seed existing open houses failed', err)
    }
  }

  void notifySavedSearchConfirmation({
    to: email,
    criteriaLabel: label,
    cadenceLabel,
    notifySummary: notifyWhat,
    searchHref: absoluteUrl(intelligenceSearchHrefFromCriteria(criteria)),
  }).catch((err) => {
    console.warn('[saved-search-alerts] confirmation email failed', err)
  })

  void notifySavedSearchCreatedAdmin({
    visitorEmail: email,
    criteriaLabel: label,
    cadenceLabel,
    visitorId: input.visitorId?.trim() || null,
  }).catch((err) => {
    console.warn('[saved-search-alerts] admin alert email failed', err)
  })

  // Soft profile: attach email to visitor cookie + upsert passwordless user.
  void (async () => {
    try {
      const vid = input.visitorId?.trim()
      if (vid) {
        const { attachProfileFieldsToVisitor } = await import(
          '@/lib/db/visitors-repo'
        )
        await attachProfileFieldsToVisitor(vid, { email })
      }
      const { upsertSiteUserByEmail } = await import('@/lib/site-user-auth')
      await upsertSiteUserByEmail({ email, visitorId: vid || null })
    } catch (err) {
      console.warn('[saved-search-alerts] profile link failed', err)
    }
  })()

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
  const parsed =
    typeof row.criteria === 'string'
      ? (JSON.parse(row.criteria) as VisitorSearchCriteria)
      : row.criteria
  const criteria = normalizeVisitorSearchCriteria(parsed)
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

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type AdminSavedSearchAlertRow = {
  id: string
  email: string | null
  visitorId: string | null
  criteriaLabel: string
  criteriaFingerprint: string
  cadence: AlertCadence
  cadenceLabel: string
  channel: AlertChannel
  active: boolean
  lastNotifiedAt: string | null
  createdAt: string
  /**
   * True when another alert shares the same email + criteria fingerprint
   * (same person signed up for the same search more than once).
   */
  isDuplicate: boolean
}

function cadenceLabelFor(row: SavedSearchAlert): string {
  if (row.cadence === 'immediate') return 'Immediate'
  if (row.cadence === 'daily') {
    return row.dailyTimeEt ? `Daily ${row.dailyTimeEt} ET` : 'Daily'
  }
  const day =
    row.weeklyDay != null && row.weeklyDay >= 0 && row.weeklyDay <= 6
      ? WEEKDAY_SHORT[row.weeklyDay]
      : null
  if (day && row.weeklyTimeEt) return `Weekly ${day} ${row.weeklyTimeEt} ET`
  if (day) return `Weekly ${day}`
  return 'Weekly'
}

function adminUserKey(email: string | null): string {
  const trimmed = email?.trim().toLowerCase() ?? ''
  return trimmed || '(no email)'
}

function duplicateGroupKey(email: string | null, fingerprint: string): string {
  return `${adminUserKey(email)}\0${fingerprint}`
}

/** Newest end-user listing alerts for Admin → Communications. */
export async function listSavedSearchAlertsForAdmin(
  limit = 100,
): Promise<AdminSavedSearchAlertRow[]> {
  await ensureSavedSearchAlertTables()
  const capped = Math.min(Math.max(1, Math.floor(limit)), 500)
  const rows = await query<AlertRow>(
    `SELECT * FROM saved_search_alerts
     ORDER BY created_at DESC
     LIMIT $1`,
    [capped],
  )
  const alerts = rows.map(mapRow)
  const dupCounts = new Map<string, number>()
  for (const alert of alerts) {
    const key = duplicateGroupKey(alert.email, alert.criteriaFingerprint)
    dupCounts.set(key, (dupCounts.get(key) ?? 0) + 1)
  }
  return alerts.map((alert) => {
    const key = duplicateGroupKey(alert.email, alert.criteriaFingerprint)
    return {
      id: alert.id,
      email: alert.email,
      visitorId: alert.visitorId,
      criteriaLabel: alert.criteriaLabel,
      criteriaFingerprint: alert.criteriaFingerprint,
      cadence: alert.cadence,
      cadenceLabel: cadenceLabelFor(alert),
      channel: alert.channel,
      active: alert.active,
      lastNotifiedAt: alert.lastNotifiedAt,
      createdAt: alert.createdAt,
      isDuplicate: (dupCounts.get(key) ?? 0) > 1,
    }
  })
}

/** Enable or disable a listing alert (admin). Returns false if id missing. */
export async function setSavedSearchAlertActive(
  id: string,
  active: boolean,
): Promise<boolean> {
  await ensureSavedSearchAlertTables()
  const trimmed = id.trim()
  if (!trimmed) return false
  const updated = await query<{ id: string }>(
    `UPDATE saved_search_alerts
     SET active = $2, updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [trimmed, active],
  )
  return updated.length > 0
}

/** Permanently delete a listing alert and its delivery rows (admin). */
export async function deleteSavedSearchAlert(id: string): Promise<boolean> {
  await ensureSavedSearchAlertTables()
  const trimmed = id.trim()
  if (!trimmed) return false
  const deleted = await query<{ id: string }>(
    `DELETE FROM saved_search_alerts
     WHERE id = $1
     RETURNING id`,
    [trimmed],
  )
  return deleted.length > 0
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
  photo_count: string | number | null
  next_oh?: string | null
}

export type AlertDeliveryKind = 'listing' | 'open_house'

function toMatchListing(
  row: ListingMatchRow,
  matchKind: AlertDeliveryKind = 'listing',
): SavedSearchMatchListing {
  const mlsId = row.mls_id.trim()
  const photoCount =
    row.photo_count != null ? Number(row.photo_count) : 0
  return {
    id: row.id,
    mlsId,
    address: row.address_full || row.address_street || null,
    town: row.town,
    price: row.price != null ? Number(row.price) : null,
    beds: row.beds != null ? Number(row.beds) : null,
    baths: row.baths != null ? Number(row.baths) : null,
    // Short public share URL uses MLS # — not the long Matrix listing_key.
    href: listingShareHref(mlsId),
    photoUrl:
      Number.isFinite(photoCount) && photoCount > 0
        ? // Email clients cannot retry ?fetch=1. Incremental warms full, not
          // the card `__card` mid blob — so default ?size=mid 404s in Gmail.
          absoluteUrl(listingPhotoProxyUrl(mlsId, 0, { size: 'full' }))
        : null,
    matchKind,
    openHouseWhen: row.next_oh?.trim() || null,
  }
}

function appendListingCriteria(
  c: VisitorSearchCriteria,
  params: unknown[],
  conditions: string[],
): void {
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
  if (c.minPrice != null && c.minPrice > 0) {
    params.push(c.minPrice)
    conditions.push(`l.price IS NOT NULL AND l.price >= $${params.length}`)
  }
  if (c.maxPrice != null && c.maxPrice > 0) {
    params.push(c.maxPrice)
    conditions.push(`l.price IS NOT NULL AND l.price <= $${params.length}`)
  }
}

/**
 * Find Active listings matching criteria that look "new" since `sinceIso`
 * and have not already been delivered as a listing match for this alert.
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
         AND COALESCE(d.event_kind, 'listing') = 'listing'
     )`,
  ]
  appendListingCriteria(c, params, conditions)

  params.push(limit)
  const sql = `
    SELECT l.id, l.mls_id, l.address_full, l.address_street, l.town,
           l.price, l.beds, l.baths, l.photo_count
    FROM listings l
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(l.list_date, l.modification_timestamp) DESC NULLS LAST
    LIMIT $${params.length}
  `
  const rows = await query<ListingMatchRow>(sql, params)
  return rows.map((row) => toMatchListing(row, 'listing'))
}

/**
 * Matching Active listings that have an upcoming public open house and have
 * not yet been delivered as an open-house event for this alert.
 */
export async function findMatchingOpenHouseListings(
  alert: SavedSearchAlert,
  opts?: { ignoreDeliveries?: boolean; limit?: number },
): Promise<SavedSearchMatchListing[]> {
  await ensureOpenHousesTable()
  const c = alert.criteria
  const today = etCalendarDate()
  const params: unknown[] = [alert.id, today]
  const conditions: string[] = [
    `l.status_bucket = 'Active'`,
    `EXISTS (
       SELECT 1 FROM open_houses oh
       WHERE oh.oh_date >= $2::date
         AND (
           (oh.listing_id IS NOT NULL AND oh.listing_id = l.mls_id)
           OR (oh.listing_key IS NOT NULL AND oh.listing_key = l.listing_key)
         )
     )`,
  ]
  if (!opts?.ignoreDeliveries) {
    conditions.push(`NOT EXISTS (
       SELECT 1 FROM saved_search_alert_deliveries d
       WHERE d.alert_id = $1 AND d.listing_id = l.id
         AND d.event_kind = 'open_house'
     )`)
  }
  appendListingCriteria(c, params, conditions)
  params.push(opts?.limit ?? 25)
  const sql = `
    SELECT l.id, l.mls_id, l.address_full, l.address_street, l.town,
           l.price, l.beds, l.baths, l.photo_count,
           (
             SELECT oh2.oh_date::text ||
                    COALESCE(' · ' || LEFT(oh2.start_datetime, 5), '')
             FROM open_houses oh2
             WHERE oh2.oh_date >= $2::date
               AND (
                 (oh2.listing_id IS NOT NULL AND oh2.listing_id = l.mls_id)
                 OR (oh2.listing_key IS NOT NULL AND oh2.listing_key = l.listing_key)
               )
             ORDER BY oh2.oh_date ASC, oh2.start_datetime ASC NULLS LAST
             LIMIT 1
           ) AS next_oh
    FROM listings l
    WHERE ${conditions.join(' AND ')}
    ORDER BY l.town ASC NULLS LAST, l.address_street ASC NULLS LAST
    LIMIT $${params.length}
  `
  const rows = await query<ListingMatchRow>(sql, params)
  return rows.map((row) => toMatchListing(row, 'open_house'))
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

function etDayKey(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Calendar date of the most recent `weekdayEt` (0=Sun) in America/New_York. */
function etWeekKey(weekdayEt: number, d = new Date()): string {
  const targetWeekday = ((weekdayEt % 7) + 7) % 7
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    fmt
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const wd = weekdayIndex[parts.weekday ?? ''] ?? 0
  const daysFromTarget = (wd - targetWeekday + 7) % 7
  const targetMs =
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) -
    daysFromTarget * 86_400_000
  const target = new Date(targetMs)
  const ty = target.getUTCFullYear()
  const tm = String(target.getUTCMonth() + 1).padStart(2, '0')
  const td = String(target.getUTCDate()).padStart(2, '0')
  return `${ty}-${tm}-${td}`
}

function alreadyNotifiedEtDay(lastNotifiedAt: string | null): boolean {
  if (!lastNotifiedAt) return false
  const t = new Date(lastNotifiedAt)
  if (Number.isNaN(t.getTime())) return false
  return etDayKey(t) === etDayKey()
}

function alreadyNotifiedEtWeek(
  lastNotifiedAt: string | null,
  weekdayEt: number,
): boolean {
  if (!lastNotifiedAt) return false
  const t = new Date(lastNotifiedAt)
  if (Number.isNaN(t.getTime())) return false
  return etWeekKey(weekdayEt, t) === etWeekKey(weekdayEt)
}

function isAtOrAfterScheduled(scheduledHhmm: string): boolean {
  const target = parseHhmmToMinutes(scheduledHhmm)
  if (target < 0) return false
  return etParts().minutes >= target
}

/**
 * Daily/weekly used to require the ET clock to sit inside a 30-minute window.
 * Incremental (and its Netlify warm hop) often finished outside that window, so
 * a whole day or week was skipped. Catch up: due once the scheduled time has
 * passed, until a send lands on this ET day / week.
 */
function isCadenceDue(alert: SavedSearchAlert, force: boolean): boolean {
  if (force) return true
  if (alert.cadence === 'immediate') return true
  if (alert.cadence === 'daily') {
    if (!alert.dailyTimeEt) return false
    if (alreadyNotifiedEtDay(alert.lastNotifiedAt)) return false
    return isAtOrAfterScheduled(alert.dailyTimeEt)
  }
  if (alert.weeklyDay == null || !alert.weeklyTimeEt) return false
  if (alreadyNotifiedEtWeek(alert.lastNotifiedAt, alert.weeklyDay)) return false
  const { weekday } = etParts()
  const daysFromSend = (weekday - alert.weeklyDay + 7) % 7
  if (daysFromSend === 0 && !isAtOrAfterScheduled(alert.weeklyTimeEt)) {
    return false
  }
  return true
}

async function markDelivered(
  alertId: string,
  listings: SavedSearchMatchListing[],
  channel: AlertChannel,
  eventKind: AlertDeliveryKind,
  opts?: { touchLastNotified?: boolean },
): Promise<void> {
  for (const listing of listings) {
    await query(
      `INSERT INTO saved_search_alert_deliveries (alert_id, listing_id, channel, event_kind)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [alertId, listing.id, channel, eventKind],
    )
  }
  if (opts?.touchLastNotified === false) return
  await query(
    `UPDATE saved_search_alerts
     SET last_notified_at = now(), updated_at = now()
     WHERE id = $1`,
    [alertId],
  )
}

function mergeAlertMatches(
  listings: SavedSearchMatchListing[],
  openHouses: SavedSearchMatchListing[],
): SavedSearchMatchListing[] {
  const byId = new Map<string, SavedSearchMatchListing>()
  for (const row of listings) byId.set(row.id, row)
  for (const row of openHouses) {
    const existing = byId.get(row.id)
    if (!existing) {
      byId.set(row.id, row)
      continue
    }
    byId.set(row.id, {
      ...existing,
      matchKind: 'open_house',
      openHouseWhen: row.openHouseWhen ?? existing.openHouseWhen,
    })
  }
  return [...byId.values()]
}

async function deliverAlert(
  alert: SavedSearchAlert,
  listingMatches: SavedSearchMatchListing[],
  openHouseMatches: SavedSearchMatchListing[],
): Promise<number> {
  const listings = mergeAlertMatches(listingMatches, openHouseMatches)
  if (!alert.email || listings.length === 0) return 0
  const ok = await notifySavedSearchByEmail({
    to: alert.email,
    criteriaLabel: alert.criteriaLabel,
    cadence: alert.cadence,
    searchHref: absoluteUrl(
      intelligenceSearchHrefFromCriteria(alert.criteria),
    ),
    listings,
  })
  if (!ok) return 0
  if (listingMatches.length > 0) {
    await markDelivered(alert.id, listingMatches, 'email', 'listing', {
      touchLastNotified: false,
    })
  }
  if (openHouseMatches.length > 0) {
    await markDelivered(alert.id, openHouseMatches, 'email', 'open_house', {
      touchLastNotified: false,
    })
  }
  await markDelivered(alert.id, [], 'email', 'listing', {
    touchLastNotified: true,
  })
  return listings.length
}

/**
 * Process due alerts after an MLS incremental, open-houses sync, or Admin Process now.
 * - immediate: any new listing / newly detected open house since last notify
 * - daily / weekly: due once the ET send time has passed this day / week
 *   (catch-up — no longer a 30-minute window that Incremental can miss)
 */
export async function processDueSavedSearchAlerts(opts?: {
  /** Ignore cadence clocks — still dedupes per listing and uses last notify as since. */
  force?: boolean
}): Promise<{
  checked: number
  sent: number
  listings: number
}> {
  const force = opts?.force === true
  try {
    await ensureSavedSearchAlertTables()
  } catch (err) {
    console.warn('[saved-search-alerts] ensure tables failed', err)
    return { checked: 0, sent: 0, listings: 0 }
  }

  const alerts = await loadActiveAlerts()
  let sent = 0
  let listingCount = 0

  for (const alert of alerts) {
    try {
      if (!isCadenceDue(alert, force)) continue

      const since =
        alert.lastNotifiedAt ||
        alert.createdAt ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const listingMatches = criteriaWantsListingAlerts(alert.criteria)
        ? await findMatchingNewListings(alert, since)
        : []
      const openHouseMatches = criteriaWantsOpenHouseAlerts(alert.criteria)
        ? await findMatchingOpenHouseListings(alert)
        : []
      if (listingMatches.length === 0 && openHouseMatches.length === 0) continue
      const n = await deliverAlert(alert, listingMatches, openHouseMatches)
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
