import 'server-only'

import type { StackCostRollup, StackCostVendorRow } from '@/lib/stack-cost-types'

export type { StackCostRollup, StackCostStatus, StackCostVendorRow } from '@/lib/stack-cost-types'

/** Default window: June + July 2026 (UTC). */
export const STACK_COST_DEFAULT_FROM = '2026-06-01T00:00:00Z'
export const STACK_COST_DEFAULT_TO = '2026-08-01T00:00:00Z'

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function unix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000)
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = await res.text().catch(() => null)
  }
  return { ok: res.ok, status: res.status, body }
}

async function neonRow(from: string, to: string): Promise<StackCostVendorRow> {
  const need =
    'NEON_API_KEY (console → Account → API keys) and NEON_ORG_ID (Organization settings). Optional NEON_PROJECT_ID to pin one project. Launch+ plan required for consumption v2. Use monthly granularity — daily only covers the last 60 days, so June is already out of daily range.'
  const keysPresent = present('NEON_API_KEY') && present('NEON_ORG_ID')
  const base: Omit<StackCostVendorRow, 'status' | 'amountUsd' | 'note'> = {
    id: 'neon',
    vendor: 'Neon',
    what: 'Postgres compute + storage',
    need,
    envKeys: ['NEON_API_KEY', 'NEON_ORG_ID', 'NEON_PROJECT_ID'],
    keysPresent,
  }
  if (!keysPresent) {
    return { ...base, status: 'needs_key', amountUsd: null, note: 'Keys not on this host yet.' }
  }
  const orgId = process.env.NEON_ORG_ID!.trim()
  const projectId = process.env.NEON_PROJECT_ID?.trim()
  const metrics = [
    'compute_unit_seconds',
    'root_branch_bytes_month',
    'child_branch_bytes_month',
    'instant_restore_bytes_month',
    'public_network_transfer_bytes',
    'private_network_transfer_bytes',
    'extra_branches_month',
  ].join(',')
  const qs = new URLSearchParams({
    org_id: orgId,
    from,
    to,
    granularity: 'monthly',
    metrics,
  })
  if (projectId) qs.append('project_ids', projectId)
  const { ok, status, body } = await fetchJson(
    `https://console.neon.tech/api/v2/consumption_history/v2/projects?${qs}`,
    { headers: { Accept: 'application/json', Authorization: `Bearer ${process.env.NEON_API_KEY!.trim()}` } },
  )
  if (!ok) {
    return {
      ...base,
      status: 'error',
      amountUsd: null,
      note: `Neon API ${status}: ${typeof body === 'string' ? body : JSON.stringify(body).slice(0, 280)}`,
    }
  }
  return {
    ...base,
    status: 'ok',
    amountUsd: null,
    note: 'Usage metrics loaded (units, not dollars). Dollar conversion needs the Launch-plan rates from the invoice, or paste the Jun/Jul invoice total here later.',
  }
}

async function openaiRow(from: string, to: string): Promise<StackCostVendorRow> {
  const need =
    'OPENAI_ADMIN_KEY (platform.openai.com → Organization → Admin keys) with api.usage.read. The existing OPENAI_API_KEY for descriptors usually cannot read org costs.'
  const admin = process.env.OPENAI_ADMIN_KEY?.trim() || ''
  const keysPresent = Boolean(admin)
  const base: Omit<StackCostVendorRow, 'status' | 'amountUsd' | 'note'> = {
    id: 'openai',
    vendor: 'OpenAI',
    what: 'Descriptors / finish-quality',
    need,
    envKeys: ['OPENAI_ADMIN_KEY'],
    keysPresent,
  }
  if (!keysPresent) {
    return {
      ...base,
      status: 'needs_key',
      amountUsd: null,
      note: present('OPENAI_API_KEY')
        ? 'OPENAI_API_KEY is set but cannot read organization costs. Need an admin key.'
        : 'No OpenAI admin key on this host.',
    }
  }
  const qs = new URLSearchParams({
    start_time: String(unix(from)),
    end_time: String(unix(to)),
    bucket_width: '1d',
  })
  const { ok, status, body } = await fetchJson(
    `https://api.openai.com/v1/organization/costs?${qs}`,
    { headers: { Authorization: `Bearer ${admin}` } },
  )
  if (!ok) {
    return {
      ...base,
      status: 'error',
      amountUsd: null,
      note: `OpenAI costs API ${status}: ${typeof body === 'string' ? body : JSON.stringify(body).slice(0, 280)}`,
    }
  }
  const buckets = (body as { data?: { results?: { amount?: { value?: number } }[] }[] })?.data ?? []
  let sum = 0
  let found = false
  for (const bucket of buckets) {
    for (const row of bucket.results ?? []) {
      if (typeof row.amount?.value === 'number') {
        sum += row.amount.value
        found = true
      }
    }
  }
  return {
    ...base,
    status: 'ok',
    amountUsd: found ? sum : null,
    note: found ? null : 'API returned no cost buckets for this window.',
  }
}

async function railwayRow(): Promise<StackCostVendorRow> {
  const need =
    'RAILWAY_TOKEN (railway.app → Account → Tokens) with permission to read the mls-sync project. Optional RAILWAY_WORKSPACE_ID.'
  const token = process.env.RAILWAY_TOKEN?.trim() || ''
  const keysPresent = Boolean(token)
  const base: Omit<StackCostVendorRow, 'status' | 'amountUsd' | 'note'> = {
    id: 'railway',
    vendor: 'Railway',
    what: 'mls-sync always-on Node',
    need,
    envKeys: ['RAILWAY_TOKEN', 'RAILWAY_WORKSPACE_ID'],
    keysPresent,
  }
  if (!keysPresent) {
    return { ...base, status: 'needs_key', amountUsd: null, note: 'Token not on this host yet.' }
  }
  const { ok, status, body } = await fetchJson('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `query { me { email workspaces { edges { node { id name } } } } }`,
    }),
  })
  if (!ok) {
    return {
      ...base,
      status: 'error',
      amountUsd: null,
      note: `Railway GraphQL ${status}: ${typeof body === 'string' ? body : JSON.stringify(body).slice(0, 280)}`,
    }
  }
  const errors = (body as { errors?: { message?: string }[] })?.errors
  if (errors?.length) {
    return {
      ...base,
      status: 'error',
      amountUsd: null,
      note: errors.map((e) => e.message).join('; ').slice(0, 280),
    }
  }
  return {
    ...base,
    status: 'ok',
    amountUsd: null,
    note: 'Token works. Invoice dollars still need the billing GraphQL field or a pasted Jun/Jul invoice total.',
  }
}

function netlifyRow(): StackCostVendorRow {
  return {
    id: 'netlify',
    vendor: 'Netlify',
    what: 'Site + background functions',
    status: 'manual',
    need: 'No public usage/invoice API. Paste Jun + Jul invoice totals (or the CC line) into this panel later, or export CSV from app.netlify.com → Billing.',
    envKeys: [],
    keysPresent: false,
    amountUsd: null,
    note: 'Checksum against the credit-card statement. Cannot pull this through an API.',
  }
}

function cloudflareRow(): StackCostVendorRow {
  return {
    id: 'cloudflare',
    vendor: 'Cloudflare R2',
    what: 'Listing + Vision Field Card objects',
    status: 'needs_key',
    need: 'CLOUDFLARE_API_TOKEN with Account Analytics / Billing Read, plus CLOUDFLARE_ACCOUNT_ID. R2 storage is often inside the free tier — confirm on the June and July invoices.',
    envKeys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    keysPresent: present('CLOUDFLARE_API_TOKEN') && present('CLOUDFLARE_ACCOUNT_ID'),
    amountUsd: null,
    note: 'Not fetched yet — GraphQL analytics is a follow-up once the token is on Netlify.',
  }
}

function resendRow(): StackCostVendorRow {
  return {
    id: 'resend',
    vendor: 'Resend',
    what: 'Monday brief + listing alerts',
    status: 'manual',
    need: 'Resend has no stable public invoice API. Paste Jun + Jul totals from resend.com → Billing, or the CC line.',
    envKeys: ['RESEND_API_KEY'],
    keysPresent: present('RESEND_API_KEY'),
    amountUsd: null,
    note: present('RESEND_API_KEY')
      ? 'Send key is set (outbound mail). It does not expose invoice dollars.'
      : 'No Resend key on this host.',
  }
}

function awsRow(): StackCostVendorRow {
  return {
    id: 'aws',
    vendor: 'AWS',
    what: 'EventBridge Scheduler (if armed)',
    status: 'manual',
    need: 'Optional. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY with ce:GetCostAndUsage, or paste the Jun/Jul Cost Explorer total. Likely cents if Scheduler is the only service.',
    envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    keysPresent: present('AWS_ACCESS_KEY_ID') && present('AWS_SECRET_ACCESS_KEY'),
    amountUsd: null,
    note: 'Not fetched automatically.',
  }
}

export async function loadStackCostRollup(from = STACK_COST_DEFAULT_FROM, to = STACK_COST_DEFAULT_TO): Promise<StackCostRollup> {
  const [neon, openai, railway] = await Promise.all([
    neonRow(from, to),
    openaiRow(from, to),
    railwayRow(),
  ])
  const rows = [neon, openai, railway, netlifyRow(), cloudflareRow(), resendRow(), awsRow()]
  const priced = rows.map((r) => r.amountUsd).filter((n): n is number => n != null)
  return {
    from,
    to,
    fetchedAt: new Date().toISOString(),
    rows,
    totalUsd: priced.length ? priced.reduce((a, b) => a + b, 0) : null,
  }
}
