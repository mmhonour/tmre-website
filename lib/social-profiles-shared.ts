/** Client-safe social profile types (admin Site controls). */

export type SocialProfileSlot = {
  /** Stable slot id — e.g. "instagram", "linkedin". */
  id: string
  /** Display label for the network / account. */
  label: string
  /** Handle, profile URL, or @username — used when posting is connected later. */
  handleOrUrl: string
  /** Freeform notes (audience, posting cadence, etc.). */
  notes: string
}

export type SocialProfilesConfig = {
  profiles: SocialProfileSlot[]
}

export const SOCIAL_PROFILE_SLOT_COUNT = 2

export const DEFAULT_SOCIAL_PROFILES: SocialProfilesConfig = {
  profiles: [
    {
      id: 'instagram',
      label: 'Instagram',
      handleOrUrl: '',
      notes: '',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      handleOrUrl: '',
      notes: '',
    },
  ],
}

export function normalizeSocialProfiles(raw: unknown): SocialProfilesConfig {
  const defaults = DEFAULT_SOCIAL_PROFILES.profiles
  const incoming =
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { profiles?: unknown }).profiles)
      ? ((raw as { profiles: unknown[] }).profiles)
      : []

  const profiles: SocialProfileSlot[] = defaults.map((fallback, i) => {
    const row = incoming[i]
    if (!row || typeof row !== 'object') return { ...fallback }
    const o = row as Record<string, unknown>
    const label =
      typeof o.label === 'string' && o.label.trim()
        ? o.label.trim().slice(0, 80)
        : fallback.label
    const handleOrUrl =
      typeof o.handleOrUrl === 'string' ? o.handleOrUrl.trim().slice(0, 400) : ''
    const notes = typeof o.notes === 'string' ? o.notes.trim().slice(0, 1000) : ''
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim().slice(0, 40)
        : fallback.id
    return { id, label, handleOrUrl, notes }
  })

  return { profiles }
}
