import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'
import { formatVisionOwnerDisplay } from '@/lib/vision-owner-display'
import {
  clusterKindFromId,
  extractVisionOwnerKeys,
  isIncompletePersonNameKey,
  keepParcelsOnCurrentWarrantyName,
  ownerPortfolioRelationship,
  pickUniqueOwnerPortfolios,
  visionOwnerClusterId,
  type VisionOwnerKey,
  type VisionOwnerPortfolio,
  type VisionOwnerPortfolioDraft,
} from '@/lib/vision-owner-keys'
import {
  visionPaidSaleFields,
  type VisionFieldCardJson,
  type VisionOwnershipRow,
} from '@/lib/vision-gis-parse'

let ownerClustersReady = false
let ownerClustersPromise: Promise<void> | null = null

export type VisionOwnerClusterMate = {
  town: string
  visionPid: string
  siteAddress: string
  displayName: string | null
  clusterId: string
}

type AddressOwnerRow = {
  town: string
  vision_pid: string
  owner_name: string | null
  owner_mailing_address: string | null
  address_full: string | null
  street_no: string | null
  street_name: string | null
  last_sale_date: string | null
  last_sale_price: number | string | null
  field_card: VisionFieldCardJson | null
}

function siteAddressFromRow(row: AddressOwnerRow): string {
  const full = row.address_full?.trim()
  if (full) return full
  return [row.street_no, row.street_name].filter(Boolean).join(' ').trim()
}

function lastPaidFromAddress(row: AddressOwnerRow | undefined): {
  lastPaidPrice: number | null
  lastPaidPriceLabel: string | null
  lastPaidSaleDate: string | null
} {
  if (!row) {
    return {
      lastPaidPrice: null,
      lastPaidPriceLabel: null,
      lastPaidSaleDate: null,
    }
  }
  const raw = row.last_sale_price
  const lastSalePrice = raw == null || raw === '' ? null : Number(raw)
  const paidPrice =
    lastSalePrice != null && Number.isFinite(lastSalePrice) ? lastSalePrice : null
  return visionPaidSaleFields({
    lastSaleDate: row.last_sale_date,
    lastSalePrice: paidPrice,
    ownership: ownershipFromCard(row.field_card),
  })
}

function ownershipFromCard(
  card: VisionFieldCardJson | null,
): VisionOwnershipRow[] {
  const rows = card?.ownership
  if (!Array.isArray(rows)) return []
  return rows.filter(
    (row): row is VisionOwnershipRow =>
      Boolean(row) && typeof row.owner === 'string',
  )
}

/** Idempotent DDL — Netlify may not run migrations on deploy. */
export async function ensureVisionOwnerClusterTables(): Promise<void> {
  if (ownerClustersReady) return
  if (!ownerClustersPromise) {
    ownerClustersPromise = (async () => {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS vision_owner_keys (
            town           text NOT NULL,
            vision_pid     text NOT NULL,
            key_kind       text NOT NULL,
            key_norm       text NOT NULL,
            display_label  text NOT NULL,
            role           text NOT NULL,
            updated_at     timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (town, vision_pid, key_kind, key_norm)
          )
        `)
        await query(`
          CREATE INDEX IF NOT EXISTS idx_vision_owner_keys_norm
            ON vision_owner_keys (key_kind, key_norm)
        `)
        await query(`
          CREATE TABLE IF NOT EXISTS vision_owner_cluster_members (
            cluster_id     text NOT NULL,
            town           text NOT NULL,
            vision_pid     text NOT NULL,
            display_name   text,
            site_address   text,
            updated_at     timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (cluster_id, town, vision_pid)
          )
        `)
        await query(`
          CREATE INDEX IF NOT EXISTS idx_vision_owner_cluster_pid
            ON vision_owner_cluster_members (town, vision_pid)
        `)
        ownerClustersReady = true
      } catch (err) {
        ownerClustersReady = false
        console.warn('[vision-owner-clusters] ensure table failed', err)
        throw err
      }
    })().finally(() => {
      ownerClustersPromise = null
    })
  }
  await ownerClustersPromise
  if (!ownerClustersReady) {
    throw new Error('vision owner cluster tables are not ready')
  }
}

async function loadAddressOwnerRow(
  town: string,
  visionPid: string,
): Promise<AddressOwnerRow | null> {
  return queryOne<AddressOwnerRow>(
    `SELECT town, vision_pid, owner_name, owner_mailing_address,
            address_full, street_no, street_name, last_sale_date,
            last_sale_price, field_card
       FROM vision_addresses
      WHERE town = $1 AND vision_pid = $2`,
    [town, visionPid],
  )
}

async function loadAddressOwnerRows(
  pairs: readonly { town: string; visionPid: string }[],
): Promise<Map<string, AddressOwnerRow>> {
  const byTown = new Map<string, string[]>()
  for (const pair of pairs) {
    const list = byTown.get(pair.town) ?? []
    list.push(pair.visionPid)
    byTown.set(pair.town, list)
  }
  const out = new Map<string, AddressOwnerRow>()
  for (const [town, pids] of byTown) {
    const unique = [...new Set(pids)]
    if (unique.length === 0) continue
    const rows = await query<AddressOwnerRow>(
      `SELECT town, vision_pid, owner_name, owner_mailing_address,
              address_full, street_no, street_name, last_sale_date,
              last_sale_price, field_card
         FROM vision_addresses
        WHERE town = $1 AND vision_pid = ANY($2::text[])`,
      [town, unique],
    )
    for (const row of rows) {
      out.set(`${row.town}:${row.vision_pid}`, row)
    }
  }
  return out
}

async function listKeyStamps(
  town: string,
  visionPid: string,
): Promise<string[]> {
  const rows = await query<{ key_kind: string; key_norm: string }>(
    `SELECT key_kind, key_norm FROM vision_owner_keys
      WHERE town = $1 AND vision_pid = $2`,
    [town, visionPid],
  )
  return rows.map((row) => `${row.key_kind}:${row.key_norm}`)
}

async function rebuildOwnerCluster(clusterId: string): Promise<void> {
  const sep = clusterId.indexOf(':')
  if (sep <= 0) return
  const keyKind = clusterId.slice(0, sep)
  const keyNorm = clusterId.slice(sep + 1)
  if (!keyKind || !keyNorm) return

  await execute(
    `DELETE FROM vision_owner_cluster_members WHERE cluster_id = $1`,
    [clusterId],
  )
  const peers = await query<{
    town: string
    vision_pid: string
    display_label: string
    owner_name: string | null
    address_full: string | null
    street_no: string | null
    street_name: string | null
  }>(
    `SELECT k.town, k.vision_pid, k.display_label,
            v.owner_name, v.address_full, v.street_no, v.street_name
       FROM vision_owner_keys k
       JOIN vision_addresses v
         ON v.town = k.town AND v.vision_pid = k.vision_pid
      WHERE k.key_kind = $1 AND k.key_norm = $2`,
    [keyKind, keyNorm],
  )
  if (peers.length < 2) return

  for (const peer of peers) {
    const site =
      peer.address_full?.trim() ||
      [peer.street_no, peer.street_name].filter(Boolean).join(' ').trim()
    await execute(
      `INSERT INTO vision_owner_cluster_members (
         cluster_id, town, vision_pid, display_name, site_address, updated_at
       ) VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (cluster_id, town, vision_pid) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         site_address = EXCLUDED.site_address,
         updated_at = EXCLUDED.updated_at`,
      [
        clusterId,
        peer.town,
        peer.vision_pid,
        peer.owner_name?.trim() || peer.display_label,
        site || null,
      ],
    )
  }
}

export function keysFromAddressRow(row: AddressOwnerRow): VisionOwnerKey[] {
  return extractVisionOwnerKeys({
    town: row.town,
    ownerName: row.owner_name,
    ownerMailingAddress: row.owner_mailing_address,
    ownership: ownershipFromCard(row.field_card),
  })
}

export async function refreshVisionOwnerKeysForParcel(
  town: string,
  visionPid: string,
): Promise<{ keys: number; clusters: number }> {
  await ensureVisionOwnerClusterTables()
  const row = await loadAddressOwnerRow(town, visionPid)
  if (!row) return { keys: 0, clusters: 0 }

  const previous = await listKeyStamps(town, visionPid)
  const next = keysFromAddressRow(row)
  const nextStamps = next.map((key) =>
    visionOwnerClusterId(key.keyKind, key.keyNorm),
  )
  const affected = [...new Set([...previous, ...nextStamps])]

  await execute(
    `DELETE FROM vision_owner_keys WHERE town = $1 AND vision_pid = $2`,
    [town, visionPid],
  )
  for (const key of next) {
    await execute(
      `INSERT INTO vision_owner_keys (
         town, vision_pid, key_kind, key_norm, display_label, role, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        town,
        visionPid,
        key.keyKind,
        key.keyNorm,
        key.displayLabel,
        key.role,
      ],
    )
  }
  for (const clusterId of affected) {
    await rebuildOwnerCluster(clusterId)
  }
  return { keys: next.length, clusters: affected.length }
}

export async function refreshVisionOwnerKeysSafe(
  town: string,
  visionPid: string,
): Promise<void> {
  try {
    await refreshVisionOwnerKeysForParcel(town, visionPid)
  } catch (err) {
    console.warn(
      '[vision-owner-clusters] refresh failed',
      town,
      visionPid,
      err instanceof Error ? err.message : err,
    )
  }
}

export async function listVisionOwnerClusterMates(
  town: string,
  visionPid: string,
): Promise<VisionOwnerClusterMate[]> {
  await ensureVisionOwnerClusterTables()
  const rows = await query<{
    town: string
    vision_pid: string
    site_address: string | null
    display_name: string | null
    cluster_id: string
  }>(
    `SELECT DISTINCT ON (m2.town, m2.vision_pid)
            m2.town, m2.vision_pid, m2.site_address, m2.display_name, m2.cluster_id
       FROM vision_owner_cluster_members m
       JOIN vision_owner_cluster_members m2
         ON m2.cluster_id = m.cluster_id
        AND (m2.town, m2.vision_pid) <> (m.town, m.vision_pid)
      WHERE m.town = $1 AND m.vision_pid = $2
      ORDER BY m2.town, m2.vision_pid,
               CASE WHEN m2.cluster_id LIKE 'mailing:%' THEN 0 ELSE 1 END,
               m2.cluster_id`,
    [town, visionPid],
  )
  const subjectRow = await loadAddressOwnerRow(town, visionPid)
  const subjectKeys = subjectRow ? keysFromAddressRow(subjectRow) : null
  const cards = await loadAddressOwnerRows(
    rows.map((row) => ({ town: row.town, visionPid: row.vision_pid })),
  )
  return rows
    .filter((row) => {
      if (!row.cluster_id.startsWith('name:')) return true
      const keyNorm = row.cluster_id.slice('name:'.length)
      if (isIncompletePersonNameKey(keyNorm)) return false
      if (
        subjectKeys &&
        !subjectKeys.some((key) => key.keyKind === 'name' && key.keyNorm === keyNorm)
      ) {
        return false
      }
      const mate = cards.get(`${row.town}:${row.vision_pid}`)
      if (!mate) return true
      return keysFromAddressRow(mate).some(
        (key) => key.keyKind === 'name' && key.keyNorm === keyNorm,
      )
    })
    .map((row) => ({
    town: row.town,
    visionPid: row.vision_pid,
    siteAddress: row.site_address?.trim() || row.vision_pid,
    displayName: row.display_name?.trim() || null,
    clusterId: row.cluster_id,
  }))
}

export async function listVisionOwnerPortfolios(opts: {
  town: string
  streetName?: string | null
  minParcels?: number
}): Promise<VisionOwnerPortfolio[]> {
  await ensureVisionOwnerClusterTables()
  const town = opts.town.trim()
  const streetName = opts.streetName?.trim() || null
  const minParcels = Math.max(2, opts.minParcels ?? 2)
  const rows = streetName
    ? await query<{
        cluster_id: string
        parcel_count: string
        display_name: string | null
        key_label: string | null
        town: string
        parcels: {
          town: string
          visionPid: string
          siteAddress: string | null
        }[]
      }>(
        `SELECT m.cluster_id,
                COUNT(*)::text AS parcel_count,
                MIN(m.display_name) AS display_name,
                MIN(k.display_label) AS key_label,
                MIN(m.town) AS town,
                jsonb_agg(
                  jsonb_build_object(
                    'town', m.town,
                    'visionPid', m.vision_pid,
                    'siteAddress', COALESCE(m.site_address, p.address_label)
                  )
                  ORDER BY COALESCE(m.site_address, p.address_label), m.vision_pid
                ) AS parcels
           FROM vision_owner_cluster_members m
           JOIN vision_street_parcels p
             ON p.town = m.town AND p.vision_pid = m.vision_pid
           LEFT JOIN vision_owner_keys k
             ON k.town = m.town
            AND k.vision_pid = m.vision_pid
            AND k.key_kind || ':' || k.key_norm = m.cluster_id
          WHERE m.town = $1 AND p.street_name = $2
          GROUP BY m.cluster_id
         HAVING COUNT(*) >= $3
          ORDER BY COUNT(*) DESC, MIN(m.display_name)`,
        [town, streetName, minParcels],
      )
    : await query<{
        cluster_id: string
        parcel_count: string
        display_name: string | null
        key_label: string | null
        town: string
        parcels: {
          town: string
          visionPid: string
          siteAddress: string | null
        }[]
      }>(
        `SELECT m.cluster_id,
                COUNT(*)::text AS parcel_count,
                MIN(m.display_name) AS display_name,
                MIN(k.display_label) AS key_label,
                MIN(m.town) AS town,
                jsonb_agg(
                  jsonb_build_object(
                    'town', m.town,
                    'visionPid', m.vision_pid,
                    'siteAddress', m.site_address
                  )
                  ORDER BY m.site_address, m.vision_pid
                ) AS parcels
           FROM vision_owner_cluster_members m
           LEFT JOIN vision_owner_keys k
             ON k.town = m.town
            AND k.vision_pid = m.vision_pid
            AND k.key_kind || ':' || k.key_norm = m.cluster_id
          WHERE m.town = $1
          GROUP BY m.cluster_id
         HAVING COUNT(*) >= $2
          ORDER BY COUNT(*) DESC, MIN(m.display_name)`,
        [town, minParcels],
      )

  const addressPairs: { town: string; visionPid: string }[] = []
  for (const row of rows) {
    for (const parcel of row.parcels ?? []) {
      addressPairs.push({ town: parcel.town, visionPid: parcel.visionPid })
    }
  }
  const cards = await loadAddressOwnerRows(addressPairs)

  const portfolios: VisionOwnerPortfolioDraft[] = []
  for (const row of rows) {
    const kind = clusterKindFromId(row.cluster_id)
    if (!kind) continue
    if (
      kind === 'name' &&
      isIncompletePersonNameKey(row.cluster_id.slice('name:'.length))
    ) {
      continue
    }
    const rawParcels = (row.parcels ?? []).map((parcel) => ({
      town: parcel.town,
      visionPid: parcel.visionPid,
      siteAddress: parcel.siteAddress?.trim() || parcel.visionPid,
      ...lastPaidFromAddress(
        cards.get(`${parcel.town}:${parcel.visionPid}`),
      ),
    }))
    const parcels =
      kind === 'name'
        ? keepParcelsOnCurrentWarrantyName(row.cluster_id, rawParcels, (parcel) => {
            const card = cards.get(`${parcel.town}:${parcel.visionPid}`)
            return card ? keysFromAddressRow(card) : null
          })
        : rawParcels
    if (parcels.length < minParcels) continue
    const mailingLabel =
      kind === 'mailing'
        ? row.cluster_id.slice('mailing:'.length).replace(/\|/g, ', ')
        : null
    const personLabel = row.key_label?.trim() || row.display_name?.trim() || ''
    const displayName =
      kind === 'name'
        ? formatVisionOwnerDisplay(personLabel) || personLabel || row.cluster_id
        : row.display_name?.trim() || mailingLabel || row.cluster_id
    portfolios.push({
      clusterId: row.cluster_id,
      clusterKind: kind,
      relationship: ownerPortfolioRelationship(kind),
      town: row.town,
      displayName,
      mailingLabel,
      parcelCount: parcels.length,
      parcels,
    })
  }
  return pickUniqueOwnerPortfolios(portfolios)
}

export async function fillMissingVisionOwnerKeys(opts: {
  town?: string
  limit?: number
}): Promise<{ scanned: number; keyed: number }> {
  await ensureVisionOwnerClusterTables()
  const limit = Math.max(1, Math.min(opts.limit ?? 80, 400))
  const town = opts.town?.trim()
  const rows = town
    ? await query<{ town: string; vision_pid: string }>(
        `SELECT v.town, v.vision_pid
           FROM vision_addresses v
           LEFT JOIN vision_owner_keys k
             ON k.town = v.town AND k.vision_pid = v.vision_pid
          WHERE v.town = $1 AND k.vision_pid IS NULL
          ORDER BY v.vision_pid
          LIMIT $2`,
        [town, limit],
      )
    : await query<{ town: string; vision_pid: string }>(
        `SELECT v.town, v.vision_pid
           FROM vision_addresses v
           LEFT JOIN vision_owner_keys k
             ON k.town = v.town AND k.vision_pid = v.vision_pid
          WHERE k.vision_pid IS NULL
          ORDER BY v.town, v.vision_pid
          LIMIT $1`,
        [limit],
      )

  let keyed = 0
  for (const row of rows) {
    const result = await refreshVisionOwnerKeysForParcel(
      row.town,
      row.vision_pid,
    )
    if (result.keys > 0) keyed += 1
  }
  return { scanned: rows.length, keyed }
}

/**
 * Re-key the oldest stored parcels so name keys catch up to the
 * current-warranty rule. First-name leftovers are a subset; this also
 * drops superseded warranty sellers (Grimaldi on 38 Ferry).
 */
export async function refreshOldestVisionOwnerKeys(opts: {
  town?: string
  limit?: number
}): Promise<{ scanned: number; refreshed: number }> {
  await ensureVisionOwnerClusterTables()
  const limit = Math.max(1, Math.min(opts.limit ?? 80, 400))
  const town = opts.town?.trim()
  const rows = town
    ? await query<{ town: string; vision_pid: string }>(
        `SELECT town, vision_pid
           FROM (
             SELECT town, vision_pid, MIN(updated_at) AS oldest
               FROM vision_owner_keys
              WHERE town = $1
              GROUP BY town, vision_pid
           ) t
          ORDER BY oldest ASC, town, vision_pid
          LIMIT $2`,
        [town, limit],
      )
    : await query<{ town: string; vision_pid: string }>(
        `SELECT town, vision_pid
           FROM (
             SELECT town, vision_pid, MIN(updated_at) AS oldest
               FROM vision_owner_keys
              GROUP BY town, vision_pid
           ) t
          ORDER BY oldest ASC, town, vision_pid
          LIMIT $1`,
        [limit],
      )

  let refreshed = 0
  for (const row of rows) {
    await refreshVisionOwnerKeysForParcel(row.town, row.vision_pid)
    refreshed += 1
  }
  return { scanned: rows.length, refreshed }
}

/** Re-key parcels that still carry a first-name-only landlord key. */
export async function refreshIncompleteVisionOwnerNameKeys(opts: {
  town?: string
  limit?: number
}): Promise<{ scanned: number; refreshed: number }> {
  await ensureVisionOwnerClusterTables()
  const limit = Math.max(1, Math.min(opts.limit ?? 80, 400))
  const town = opts.town?.trim()
  const rows = town
    ? await query<{ town: string; vision_pid: string; key_norm: string }>(
        `SELECT k.town, k.vision_pid, k.key_norm
           FROM vision_owner_keys k
          WHERE k.town = $1 AND k.key_kind = 'name'`,
        [town],
      )
    : await query<{ town: string; vision_pid: string; key_norm: string }>(
        `SELECT k.town, k.vision_pid, k.key_norm
           FROM vision_owner_keys k
          WHERE k.key_kind = 'name'`,
      )

  const seen = new Set<string>()
  let refreshed = 0
  for (const row of rows) {
    if (!isIncompletePersonNameKey(row.key_norm)) continue
    const stamp = `${row.town}:${row.vision_pid}`
    if (seen.has(stamp)) continue
    seen.add(stamp)
    await refreshVisionOwnerKeysForParcel(row.town, row.vision_pid)
    refreshed += 1
    if (refreshed >= limit) break
  }
  return { scanned: rows.length, refreshed }
}
