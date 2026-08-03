import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  cloneIntelligenceDescriptorSizes,
  DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
  isDefaultIntelligenceDescriptorSizes,
  normalizeIntelligenceDescriptorSizes,
  type IntelligenceDescriptorSizes,
} from '@/lib/intelligence-descriptor-sizes-shared'

export const INTELLIGENCE_DESCRIPTOR_SIZES_SYNC_KEY =
  'intelligence_descriptor_sizes'

export {
  DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
  cloneIntelligenceDescriptorSizes,
  isDefaultIntelligenceDescriptorSizes,
  type IntelligenceDescriptorSizes,
}

function parseConfig(raw: string | null): IntelligenceDescriptorSizes {
  if (!raw) return cloneIntelligenceDescriptorSizes()
  try {
    const parsed = normalizeIntelligenceDescriptorSizes(JSON.parse(raw))
    return parsed.ok ? parsed.config : cloneIntelligenceDescriptorSizes()
  } catch {
    return cloneIntelligenceDescriptorSizes()
  }
}

export function getIntelligenceDescriptorSizes(): IntelligenceDescriptorSizes {
  return parseConfig(getSyncMeta(INTELLIGENCE_DESCRIPTOR_SIZES_SYNC_KEY))
}

export async function getIntelligenceDescriptorSizesFresh(): Promise<IntelligenceDescriptorSizes> {
  try {
    return parseConfig(
      await getSyncMetaFresh(INTELLIGENCE_DESCRIPTOR_SIZES_SYNC_KEY),
    )
  } catch {
    return getIntelligenceDescriptorSizes()
  }
}

export async function setIntelligenceDescriptorSizes(
  input: unknown,
): Promise<IntelligenceDescriptorSizes> {
  const normalized = normalizeIntelligenceDescriptorSizes(input)
  if (!normalized.ok) throw new Error(normalized.error)
  await setSyncMetaDurable(
    INTELLIGENCE_DESCRIPTOR_SIZES_SYNC_KEY,
    JSON.stringify(normalized.config),
  )
  return normalized.config
}
