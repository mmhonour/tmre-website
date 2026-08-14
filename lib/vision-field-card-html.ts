/**
 * Prepare VGSI Field Card HTML if a reference viewer is needed.
 * Find now renders parsed `field_card` jsonb; R2 HTML is the archive pointer.
 * Scripts and inline handlers are stripped; a <base href> keeps relative
 * images/CSS pointed at Vision GIS.
 */
export function prepareVisionFieldCardSrcDoc(
  html: string,
  baseUrl: string,
): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/javascript:/gi, '')

  const baseTag = `<base href="${base}">`
  if (/<head[\s>]/i.test(stripped)) {
    return stripped.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }
  return `<!DOCTYPE html><html><head>${baseTag}<meta charset="utf-8"></head><body>${stripped}</body></html>`
}
