import {
  formatVisionFieldValue,
  type VisionFieldCardField,
} from '@/lib/vision-gis-parse'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * TMRE-owned printable Field Card from parsed jsonb.
 * Do not replay VGSI HTML here — `<base href>` makes Print / Field Card / Home
 * leave the site and look like a Vision GIS link (including their PDF button).
 */
export function renderTmreFieldCardHtml(input: {
  town: string
  visionPid: string
  street: string
  addressFull: string
  mblu: string | null
  fields: VisionFieldCardField[]
  parcelHref: string
  parcelUrl: string | null
}): string {
  const groups: { section: string; fields: VisionFieldCardField[] }[] = []
  for (const field of input.fields) {
    const last = groups[groups.length - 1]
    if (last && last.section === field.section) {
      last.fields.push(field)
      continue
    }
    groups.push({ section: field.section, fields: [field] })
  }

  const sections = groups
    .map((group) => {
      const rows = group.fields
        .map(
          (field) =>
            `<div class="row"><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(formatVisionFieldValue(field.section, field.label, field.value))}</dd></div>`,
        )
        .join('')
      return `<section><h2>${escapeHtml(group.section)}</h2><dl>${rows}</dl></section>`
    })
    .join('')

  const gis = input.parcelUrl
    ? `<a href="${escapeHtml(input.parcelUrl)}" rel="noreferrer">Live Vision GIS</a>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.street)} — Field Card — ${escapeHtml(input.town)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f6f1e8; color: #1a2332; font-family: ui-sans-serif, system-ui, sans-serif; }
    header { background: #131f38; color: #fff; padding: 1.5rem 1.25rem 1.25rem; }
    header p { margin: 0 0 0.4rem; font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #c4a35a; }
    header a { color: #c4a35a; }
    h1 { margin: 0; font-family: Georgia, serif; font-size: 1.75rem; font-weight: 400; }
    .sub { margin: 0.4rem 0 0; font-family: ui-monospace, monospace; font-size: 13px; color: rgba(255,255,255,0.7); }
    main { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
    section { margin: 0 0 1.5rem; }
    h2 { margin: 0 0 0.4rem; font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #c4a35a; }
    dl { margin: 0; }
    .row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid rgba(26,35,50,0.08); }
    dt { font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #5c6570; }
    dd { margin: 0; font-family: ui-monospace, monospace; font-size: 13px; text-align: right; max-width: 65%; }
    footer { font-family: ui-monospace, monospace; font-size: 11px; color: #5c6570; }
    footer a { color: #131f38; }
    @media print { body { background: #fff; } header { background: #fff; color: #131f38; } header p, header a, .sub { color: #5c6570; } }
  </style>
</head>
<body>
  <header>
    <p><a href="${escapeHtml(input.parcelHref)}">Find · ${escapeHtml(input.town)}</a> · Field Card</p>
    <h1>${escapeHtml(input.street)}</h1>
    <p class="sub">${escapeHtml(input.addressFull)}${input.mblu ? ` · MBLU ${escapeHtml(input.mblu)}` : ''} · PID ${escapeHtml(input.visionPid)}</p>
  </header>
  <main>
    ${sections || '<p>No parsed Field Card fields yet.</p>'}
    <footer>
      Catalogued from the Vision GIS Field Card (HTML → JSON). Not a PDF.
      ${gis}
    </footer>
  </main>
</body>
</html>`
}

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
