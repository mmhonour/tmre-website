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
  attachVisitorVisitFields,
  listVisitorRecords,
  readVisitorByVid,
  recordVisitorPageview,
} from '@/lib/db/visitors-repo'
import {
  emptyVisitorGeo,
  formatVisitorIdentity,
  formatVisitorLocation,
  groupVisitorsByProviderThenLocation,
  groupVisitorsByZip,
  normalizeVisitorZip,
  visitorIdentitySourceLabel,
  visitorIsAdmin,
  visitorIsIdentified,
  visitorZip,
  type VisitorGeo,
  type VisitorIdentitySource,
  type VisitorPageHit,
  type VisitorProviderGroup,
  type VisitorRecord,
  type VisitorZipGroup,
} from '@/lib/visitors-types'

export type {
  VisitorGeo,
  VisitorIdentitySource,
  VisitorPageHit,
  VisitorProviderGroup,
  VisitorRecord,
  VisitorZipGroup,
}
export {
  emptyVisitorGeo,
  formatVisitorIdentity,
  formatVisitorLocation,
  groupVisitorsByProviderThenLocation,
  groupVisitorsByZip,
  normalizeVisitorZip,
  visitorIdentitySourceLabel,
  visitorIsAdmin,
  visitorIsIdentified,
  visitorZip,
}

export {
  attachLeadFieldsToVisitor,
  attachVisitorVisitFields,
  readVisitorByVid,
  recordVisitorPageview,
}

export async function readVisitorRecords(): Promise<VisitorRecord[]> {
  return listVisitorRecords()
}
