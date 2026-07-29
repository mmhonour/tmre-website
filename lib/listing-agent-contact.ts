/**
 * Pull listing / showing-contact agent fields from opaque RETS `raw`.
 * SmartMLS follows RESO names; we also accept common synonyms.
 */

export type ListingAgentContact = {
  /** Preferred “who to contact” — Showing contact, else list agent. */
  contactingName: string | null
  contactingLabel: string
  phone: string | null
  email: string | null
  agentMlsId: string | null
  listAgentName: string | null
  listOfficeName: string | null
  coListAgentName: string | null
  showingContactType: string | null
}

function rawStr(
  raw: Record<string, string>,
  ...candidates: string[]
): string | null {
  for (const key of candidates) {
    const v = raw[key]?.trim()
    if (v) return v
  }
  const byLower = new Map<string, string>()
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.trim()) {
      byLower.set(k.toLowerCase(), v.trim())
    }
  }
  for (const key of candidates) {
    const v = byLower.get(key.toLowerCase())
    if (v) return v
  }
  return null
}

function joinName(
  raw: Record<string, string>,
  firstKeys: string[],
  lastKeys: string[],
  fullKeys: string[],
): string | null {
  const full = rawStr(raw, ...fullKeys)
  if (full) return full
  const first = rawStr(raw, ...firstKeys)
  const last = rawStr(raw, ...lastKeys)
  const joined = [first, last].filter(Boolean).join(' ').trim()
  return joined || null
}

/** Extract contacting / list agent details for Admin-only listing UI. */
export function extractListingAgentContact(
  raw: Record<string, string> | null | undefined,
): ListingAgentContact | null {
  if (!raw || typeof raw !== 'object') return null

  const listAgentName = joinName(
    raw,
    ['ListAgentFirstName', 'ListAgentFirstName1'],
    ['ListAgentLastName', 'ListAgentLastName1'],
    ['ListAgentFullName', 'ListAgentName', 'ListMemberFullName'],
  )
  const coListAgentName = joinName(
    raw,
    ['CoListAgentFirstName'],
    ['CoListAgentLastName'],
    ['CoListAgentFullName', 'CoListAgentName'],
  )
  const showingName = rawStr(
    raw,
    'ShowingContactName',
    'ShowingContactFullName',
    'ShowingAgentName',
  )
  const showingContactType = rawStr(raw, 'ShowingContactType')
  const listOfficeName = rawStr(
    raw,
    'ListOfficeName',
    'ListOffice',
    'OfficeName',
  )
  const agentMlsId = rawStr(
    raw,
    'ListAgentMlsId',
    'ListAgentKey',
    'ListAgentId',
    'ListAgentAgentID',
  )

  const contactingName = showingName || listAgentName
  if (!contactingName && !listOfficeName && !coListAgentName) {
    return null
  }

  const phone = rawStr(
    raw,
    'ShowingContactPhone',
    'ShowingContactPhoneNumber',
    'ListAgentPreferredPhone',
    'ListAgentDirectPhone',
    'ListAgentCellPhone',
    'ListAgentMobilePhone',
    'ListAgentOfficePhone',
    'ListOfficePhone',
    'ListAgentPhone',
  )
  const email = rawStr(
    raw,
    'ShowingContactEmail',
    'ListAgentEmail',
    'ListAgentEmailAddress',
    'ListOfficeEmail',
  )

  return {
    contactingName,
    contactingLabel: showingName
      ? showingContactType
        ? `Showing contact (${showingContactType})`
        : 'Showing contact'
      : 'List agent',
    phone,
    email,
    agentMlsId,
    listAgentName,
    listOfficeName,
    coListAgentName,
    showingContactType,
  }
}
