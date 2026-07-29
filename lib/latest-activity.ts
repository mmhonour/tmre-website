import { mlsTimestampMs } from '@/lib/mls-time'

/**
 * Freshest clock for Latest ranking / day headers: MLS mod vs list date.
 * Brand-new inventory often has a newer listDate than ModificationTimestamp.
 */
export function latestActivityIso(
  modificationTimestamp: string | null | undefined,
  listDate: string | null | undefined,
): string | null {
  const mod = modificationTimestamp?.trim() || null
  const listed = listDate?.trim() || null
  if (!mod) return listed
  if (!listed) return mod
  const modMs = mlsTimestampMs(mod)
  const listMs = mlsTimestampMs(listed)
  if (Number.isNaN(modMs)) return listed
  if (Number.isNaN(listMs)) return mod
  return listMs > modMs ? listed : mod
}

export function latestActivityMs(
  modificationTimestamp: string | null | undefined,
  listDate: string | null | undefined,
): number {
  return mlsTimestampMs(latestActivityIso(modificationTimestamp, listDate))
}
