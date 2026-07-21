import 'server-only'

/**
 * Website visitor activity log — Neon Postgres (`visitors` table).
 *
 * Replaces the former `data/visitors.json` file store, which cannot persist on
 * Netlify serverless (ephemeral filesystem). Same durable pattern as listings /
 * saved-search alerts.
 */

import {
  attachLeadFieldsToVisitor,
  listVisitorRecords,
  readVisitorByVid,
  recordVisitorPageview,
} from '@/lib/db/visitors-repo'
import {
  emptyVisitorGeo,
  type VisitorGeo,
  type VisitorPageHit,
  type VisitorRecord,
} from '@/lib/visitors-types'

export type { VisitorGeo, VisitorPageHit, VisitorRecord }
export { emptyVisitorGeo }

export {
  attachLeadFieldsToVisitor,
  readVisitorByVid,
  recordVisitorPageview,
}

export async function readVisitorRecords(): Promise<VisitorRecord[]> {
  return listVisitorRecords()
}

export function formatVisitorLocation(visitor: VisitorRecord): string {
  const { geo, zip } = visitor
  const parts = [geo.city, geo.region, geo.postal || zip].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (geo.country) return geo.country
  return 'Unknown location'
}

export function formatVisitorIdentity(visitor: VisitorRecord): string {
  if (visitor.name && visitor.email) return `${visitor.name} · ${visitor.email}`
  if (visitor.email) return visitor.email
  if (visitor.name) return visitor.name
  return 'Anonymous'
}
