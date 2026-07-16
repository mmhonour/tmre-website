import 'server-only'

/**
 * Describe which Postgres the current process is talking to.
 *
 * Admin Site controls and listing inventory both go through DATABASE_URL.
 * Localhost uses a native/local Postgres; production Netlify uses Neon.
 * They are independent databases — an edit in one never appears in the other.
 */

export type PostgresTargetKind = 'neon' | 'local' | 'other' | 'unset'

export type PostgresTarget = {
  kind: PostgresTargetKind
  /** Short chip label, e.g. "Neon" / "Local Postgres". */
  shortLabel: string
  /** Explicit admin banner line, e.g. "Editing Neon (production)". */
  editingLabel: string
  host: string
  /** One-line guidance for the admin. */
  detail: string
  /** True when Site-control writes affect the shared production store. */
  isProductionStore: boolean
}

function connectionString(): string {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.NETLIFY_DATABASE_URL?.trim() ||
    ''
  )
}

function hostFromConnectionString(raw: string): string {
  if (!raw) return ''
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

/** Snapshot of the active DATABASE_URL target for this process. */
export function describePostgresTarget(): PostgresTarget {
  const raw = connectionString()
  if (!raw) {
    return {
      kind: 'unset',
      shortLabel: 'No DATABASE_URL',
      editingLabel: 'Postgres not configured',
      host: '',
      detail: 'Set DATABASE_URL (Neon in production, local Postgres for localhost).',
      isProductionStore: false,
    }
  }

  const host = hostFromConnectionString(raw)

  if (isLocalHost(host)) {
    return {
      kind: 'local',
      shortLabel: 'Local Postgres',
      editingLabel: 'Editing local Postgres',
      host,
      detail:
        'Site-control changes stay on this machine. They do not update Neon / production.',
      isProductionStore: false,
    }
  }

  if (host.includes('neon.tech')) {
    return {
      kind: 'neon',
      shortLabel: 'Neon',
      editingLabel: 'Editing Neon (production)',
      host,
      detail:
        'Site controls write to the shared Neon store — every Lambda reads the same rows.',
      isProductionStore: true,
    }
  }

  return {
    kind: 'other',
    shortLabel: host || 'Remote Postgres',
    editingLabel: `Editing ${host || 'remote Postgres'}`,
    host,
    detail: 'Site controls write to this DATABASE_URL. Confirm it matches production.',
    isProductionStore: false,
  }
}
