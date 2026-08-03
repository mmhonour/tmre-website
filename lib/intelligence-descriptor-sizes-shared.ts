/**
 * Client-safe Intelligence filter-descriptor idle font sizes (px).
 * Active / held enlarge stays at text-lg in the UI.
 */

export type IntelligenceDescriptorSizes = {
  /** Idle descriptor size below the `lg` breakpoint. */
  mobilePx: number
  /** Idle descriptor size at `lg` and up. */
  desktopPx: number
}

export const INTEL_DESCRIPTOR_SIZE_MIN_PX = 7
export const INTEL_DESCRIPTOR_SIZE_MAX_PX = 18

/** Matches current hardcoded idle `text-[9px]`. */
export const DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES: IntelligenceDescriptorSizes =
  {
    mobilePx: 9,
    desktopPx: 9,
  }

export function cloneIntelligenceDescriptorSizes(
  source: IntelligenceDescriptorSizes = DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
): IntelligenceDescriptorSizes {
  return { mobilePx: source.mobilePx, desktopPx: source.desktopPx }
}

function clampPx(n: number): number {
  return Math.min(
    INTEL_DESCRIPTOR_SIZE_MAX_PX,
    Math.max(INTEL_DESCRIPTOR_SIZE_MIN_PX, Math.round(n)),
  )
}

export function normalizeIntelligenceDescriptorSizes(
  input: unknown,
):
  | { ok: true; config: IntelligenceDescriptorSizes }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Config object is required.' }
  }
  const row = input as Record<string, unknown>
  const mobileRaw = row.mobilePx
  const desktopRaw = row.desktopPx
  if (typeof mobileRaw !== 'number' || !Number.isFinite(mobileRaw)) {
    return { ok: false, error: 'mobilePx must be a number.' }
  }
  if (typeof desktopRaw !== 'number' || !Number.isFinite(desktopRaw)) {
    return { ok: false, error: 'desktopPx must be a number.' }
  }
  return {
    ok: true,
    config: {
      mobilePx: clampPx(mobileRaw),
      desktopPx: clampPx(desktopRaw),
    },
  }
}

export function isDefaultIntelligenceDescriptorSizes(
  config: IntelligenceDescriptorSizes,
): boolean {
  return (
    config.mobilePx === DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES.mobilePx &&
    config.desktopPx === DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES.desktopPx
  )
}

/** CSS custom properties for Intelligence descriptor idle size. */
export function intelligenceDescriptorSizeCssVars(
  config: IntelligenceDescriptorSizes,
): Record<string, string> {
  return {
    '--intel-desc-mobile': `${config.mobilePx}px`,
    '--intel-desc-desktop': `${config.desktopPx}px`,
  }
}
