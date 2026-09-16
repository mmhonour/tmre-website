/**
 * Operator-script Postgres targeting.
 *
 * `.env.local` often points DATABASE_URL at localhost while R2 is the prod
 * photo bucket. Scripts that write `listing_photo_index` must say which host
 * they will hit, refuse the docs placeholder `…neon…`, and prefer a real
 * neon.tech URL (env or a commented line in `.env.local`).
 */

export type ScriptDbKind = 'localhost' | 'prod' | 'unknown'

export type ScriptDbTarget = {
  key: string
  value: string
  host: string
  kind: ScriptDbKind
}

export const SCRIPT_DB_ENV_KEYS = [
  'DATABASE_URL_UNPOOLED',
  'NETLIFY_DATABASE_URL_UNPOOLED',
  'DATABASE_URL',
  'NETLIFY_DATABASE_URL',
] as const

const PLACEHOLDER_RE = /…|%e2%80%a6|\.{3}neon/i

export function stripWrappingQuotes(raw: string): string {
  const t = raw.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return t.slice(1, -1).trim()
    }
  }
  return t
}

export function looksLikePlaceholderDbUrl(raw: string): boolean {
  return PLACEHOLDER_RE.test(stripWrappingQuotes(raw))
}

export function classifyScriptDbHost(host: string): ScriptDbKind {
  const h = host.trim().toLowerCase()
  if (!h) return 'unknown'
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return 'localhost'
  if (h.includes('neon.tech')) return 'prod'
  return 'unknown'
}

export function parseScriptDbUrl(raw: string): { host: string; kind: ScriptDbKind } | null {
  const value = stripWrappingQuotes(raw)
  if (!value || looksLikePlaceholderDbUrl(value)) return null
  try {
    const url = new URL(value)
    const host = (url.hostname || '').trim()
    if (!host) return null
    return { host, kind: classifyScriptDbHost(host) }
  } catch {
    return null
  }
}

export function shouldUseSslForDbUrl(raw: string): boolean {
  try {
    const url = new URL(stripWrappingQuotes(raw))
    if ((url.searchParams.get('sslmode') ?? '').toLowerCase() === 'disable') {
      return false
    }
    return classifyScriptDbHost(url.hostname) !== 'localhost'
  } catch {
    return true
  }
}

export function formatScriptDbTarget(target: {
  kind: ScriptDbKind
  host: string
  key?: string
}): string {
  const key = target.key ? ` via ${target.key}` : ''
  return `${target.kind} host=${target.host}${key}`
}

export function targetFromEnvValue(
  key: string,
  raw: string | undefined | null,
): ScriptDbTarget | null {
  if (!raw) return null
  const value = stripWrappingQuotes(raw)
  if (!value || looksLikePlaceholderDbUrl(value)) return null
  const parsed = parseScriptDbUrl(value)
  if (!parsed) return null
  return { key, value, host: parsed.host, kind: parsed.kind }
}

/** Active env first, then commented neon.tech lines in `.env.local`. */
export function discoverNeonUrlsFromEnvFile(fileText: string): ScriptDbTarget[] {
  const found: ScriptDbTarget[] = []
  const keys = SCRIPT_DB_ENV_KEYS.join('|')
  const lineRe = new RegExp(`^(?:#\\s*)?(${keys})\\s*=\\s*(.*)$`)
  for (const line of fileText.split(/\r?\n/)) {
    const m = lineRe.exec(line.trim())
    if (!m) continue
    const target = targetFromEnvValue(m[1], m[2])
    if (!target || target.kind !== 'prod') continue
    found.push(target)
  }
  return found
}

function preferUnpooledThenDirect(a: ScriptDbTarget, b: ScriptDbTarget): number {
  const unpooled = (t: ScriptDbTarget) =>
    t.key.includes('UNPOOLED') ? 0 : 1
  const pooler = (t: ScriptDbTarget) =>
    t.host.includes('-pooler.') ? 1 : 0
  return unpooled(a) - unpooled(b) || pooler(a) - pooler(b)
}

export function pickProdDbTarget(options: {
  env: NodeJS.Dict<string>
  envFileText?: string | null
}): { target: ScriptDbTarget; source: string } | { error: string } {
  const fromEnv: ScriptDbTarget[] = []
  for (const key of SCRIPT_DB_ENV_KEYS) {
    const target = targetFromEnvValue(key, options.env[key])
    if (target?.kind === 'prod') fromEnv.push(target)
  }
  fromEnv.sort(preferUnpooledThenDirect)
  if (fromEnv[0]) {
    return { target: fromEnv[0], source: `env ${fromEnv[0].key}` }
  }

  const fromFile = options.envFileText
    ? discoverNeonUrlsFromEnvFile(options.envFileText)
    : []
  fromFile.sort(preferUnpooledThenDirect)
  if (fromFile[0]) {
    return {
      target: fromFile[0],
      source: `commented ${fromFile[0].key} in .env.local`,
    }
  }

  const placeholder = SCRIPT_DB_ENV_KEYS.some((key) =>
    looksLikePlaceholderDbUrl(options.env[key] ?? ''),
  )
  if (placeholder) {
    return {
      error:
        'DATABASE_URL_UNPOOLED is the docs placeholder (…neon…), not a real host. Paste the direct Neon URL from Netlify env or Neon → Connect (pooling off). Do not copy postgresql://…neon….',
    }
  }

  return {
    error:
      'No neon.tech Postgres URL found. Set DATABASE_URL_UNPOOLED to the direct Neon connection string (Netlify env or Neon dashboard). Localhost DATABASE_URL is not prod.',
  }
}

export function pickListingsDbTarget(
  env: NodeJS.Dict<string>,
): ScriptDbTarget | null {
  for (const key of ['DATABASE_URL', 'NETLIFY_DATABASE_URL'] as const) {
    const target = targetFromEnvValue(key, env[key])
    if (target) return target
  }
  return null
}
