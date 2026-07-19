import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { DEFAULT_BROKERAGE_NAME } from '@/lib/business-info'

// ---------------------------------------------------------------------------
// Admin-defined brokerage display name shown in footer, contact, privacy/terms,
// about, nav attributions, and business schema.
//
// Stored in sync_meta so it can be changed from /admin → Site with no redeploy.
// Resolution order:
//   1. admin-defined value in sync_meta (this module)
//   2. BROKERAGE_NAME env var (infra fallback)
//   3. hard-coded default in business-info (DEFAULT_BROKERAGE_NAME)
// ---------------------------------------------------------------------------

export const BROKERAGE_NAME_KEY = 'brokerage_name'
export { DEFAULT_BROKERAGE_NAME }

const MAX_LEN = 120

/** True when the string is a non-empty display name within length limits. */
export function isValidBrokerageName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.length <= MAX_LEN
}

function envFallback(): string {
  const fromEnv = process.env.BROKERAGE_NAME?.trim()
  if (fromEnv && isValidBrokerageName(fromEnv)) return fromEnv
  return DEFAULT_BROKERAGE_NAME
}

/** Configured brokerage name (synchronous, from the hydrated sync_meta cache). */
export function getBrokerageName(): string {
  const raw = getSyncMeta(BROKERAGE_NAME_KEY)
  if (raw && isValidBrokerageName(raw)) return raw.trim()
  return envFallback()
}

/** Authoritative read straight from Postgres; falls back to cache/env. */
export async function getBrokerageNameFresh(): Promise<string> {
  try {
    const raw = await getSyncMetaFresh(BROKERAGE_NAME_KEY)
    if (raw && isValidBrokerageName(raw)) return raw.trim()
  } catch {
    // fall through to cache/env
  }
  return getBrokerageName()
}

/** Persist a new brokerage display name (durable); returns the trimmed value. */
export async function setBrokerageName(value: string): Promise<string> {
  const trimmed = value.trim()
  if (!isValidBrokerageName(trimmed)) {
    throw new Error('Brokerage name must be 2–120 characters')
  }
  await setSyncMetaDurable(BROKERAGE_NAME_KEY, trimmed)
  return trimmed
}
