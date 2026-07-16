// Pre-`dev` guard: make sure local Postgres is up before the Next.js dev server
// boots, so you never get ECONNREFUSED on startup.
//
// Handles two local setups automatically:
//   1. A native Windows PostgreSQL service (e.g. "postgresql-x64-18").
//   2. A Docker container that maps :5432.
//
// Never fails the `dev` script: if it can't start Postgres (not installed,
// needs admin, remote DATABASE_URL, etc.) it prints a note and exits 0.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAG = '[ensure-postgres]'

function log(msg) {
  console.log(`${TAG} ${msg}`)
}

/** Read the active (uncommented) DATABASE_URL from .env.local, if present. */
function activeDatabaseUrl() {
  try {
    const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const m = /^DATABASE_URL\s*=\s*(.+)$/.exec(trimmed)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env.local — fall through */
  }
  return process.env.DATABASE_URL ?? ''
}

function parseHostPort(url) {
  try {
    const u = new URL(url)
    return { host: u.hostname, port: Number(u.port || 5432) }
  } catch {
    return { host: '', port: 5432 }
  }
}

function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

/** Resolve once port is accepting TCP connections (or after timeout). */
function waitForPort(host, port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host, port })
      socket.setTimeout(1500)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      const retry = () => {
        socket.destroy()
        if (Date.now() >= deadline) return resolve(false)
        setTimeout(attempt, 500)
      }
      socket.once('error', retry)
      socket.once('timeout', retry)
    }
    attempt()
  })
}

function powershell(command) {
  return execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8' },
  ).trim()
}

/** Try to start a native Windows PostgreSQL service. Returns true if attempted. */
function tryStartWindowsService() {
  let name = ''
  try {
    name = powershell(
      "Get-Service postgresql* -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.Status -ne 'Running' } | " +
        'Select-Object -First 1 -ExpandProperty Name',
    )
  } catch {
    return false
  }
  if (!name) return false

  log(`Starting Windows service "${name}"…`)
  try {
    powershell(`Start-Service '${name}'`)
    return true
  } catch {
    log(
      `Could not start "${name}" (may need admin). Run in an elevated PowerShell:\n` +
        `  Start-Service ${name}\n` +
        `  Set-Service ${name} -StartupType Automatic   # start at boot, once`,
    )
    return true
  }
}

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

/** Try to start a Docker Postgres container. Returns true if attempted. */
function tryStartDocker() {
  let out
  try {
    out = docker([
      'ps',
      '-a',
      '--format',
      '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}',
    ])
  } catch {
    return false
  }

  const rows = out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, name, image, status, ports] = line.split('|')
      return { id, name, image, status: status ?? '', ports: ports ?? '' }
    })
  const container =
    rows.find((r) => r.ports.includes('5432')) ??
    rows.find((r) => /postgres/i.test(r.image))
  if (!container) return false

  if (!/^Up\b/.test(container.status)) {
    log(`Starting Docker container "${container.name}"…`)
    try {
      docker(['start', container.id])
      docker(['update', '--restart', 'unless-stopped', container.id])
    } catch (err) {
      log(`Could not start "${container.name}": ${err?.message ?? err}.`)
    }
  }
  return true
}

async function main() {
  const dbUrl = activeDatabaseUrl()
  const { host, port } = parseHostPort(dbUrl)

  if (dbUrl && !isLocalHost(host)) {
    log(`DATABASE_URL is remote (${host}) — skipping local Postgres check.`)
    return
  }
  const targetHost = host || '127.0.0.1'
  const targetPort = port || 5432

  if (await waitForPort(targetHost, targetPort, 800)) {
    log(`Postgres already reachable on ${targetHost}:${targetPort}.`)
    return
  }

  const attempted =
    (process.platform === 'win32' && tryStartWindowsService()) ||
    tryStartDocker()

  if (!attempted) {
    log(
      'Postgres is not running and no local service/container was found. ' +
        'Start it manually, then re-run.',
    )
    return
  }

  const ready = await waitForPort(targetHost, targetPort, 20000)
  log(
    ready
      ? `Postgres is up on ${targetHost}:${targetPort}.`
      : `${targetHost}:${targetPort} not ready yet — continuing (dev may retry).`,
  )
}

main().catch((err) => {
  log(`Skipped (${err?.message ?? err}).`)
})
