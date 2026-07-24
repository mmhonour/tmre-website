import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_SOCIAL_PROFILES,
  normalizeSocialProfiles,
  type SocialProfilesConfig,
} from '@/lib/social-profiles-shared'

export const SOCIAL_PROFILES_KEY = 'social_profiles'
export {
  DEFAULT_SOCIAL_PROFILES,
  normalizeSocialProfiles,
  type SocialProfileSlot,
  type SocialProfilesConfig,
} from '@/lib/social-profiles-shared'

function parseStored(raw: string | null | undefined): SocialProfilesConfig {
  if (!raw?.trim()) return structuredClone(DEFAULT_SOCIAL_PROFILES)
  try {
    return normalizeSocialProfiles(JSON.parse(raw) as unknown)
  } catch {
    return structuredClone(DEFAULT_SOCIAL_PROFILES)
  }
}

/** Cached sync_meta read (hydrated Next server). */
export function getSocialProfiles(): SocialProfilesConfig {
  return parseStored(getSyncMeta(SOCIAL_PROFILES_KEY))
}

/** Authoritative Postgres read. */
export async function getSocialProfilesFresh(): Promise<SocialProfilesConfig> {
  try {
    const raw = await getSyncMetaFresh(SOCIAL_PROFILES_KEY)
    return parseStored(raw)
  } catch {
    return getSocialProfiles()
  }
}

/** Persist social profile slots (durable). */
export async function setSocialProfiles(
  value: unknown,
): Promise<SocialProfilesConfig> {
  const normalized = normalizeSocialProfiles(value)
  await setSyncMetaDurable(SOCIAL_PROFILES_KEY, JSON.stringify(normalized))
  return normalized
}
