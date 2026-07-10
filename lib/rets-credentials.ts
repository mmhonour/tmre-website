import 'server-only'

import { deleteSyncMeta, getSyncMeta, setSyncMeta } from '@/lib/listings-db'

export const RETS_SERVER_URL_KEY = 'rets_server_url'
export const RETS_USERNAME_KEY = 'rets_username'
export const RETS_PASSWORD_KEY = 'rets_password'
export const RETS_CREDENTIALS_UPDATED_AT_KEY = 'rets_credentials_updated_at'

/** Must stay aligned with rets-health.ts sync_meta keys. */
const RETS_HEALTH_CACHE_KEYS = [
  'rets_health_checked_at',
  'rets_health_status',
  'rets_health_message',
  'rets_health_detail',
] as const

export type RetsCredentials = {
  serverUrl: string
  username: string
  password: string
}

export type RetsCredentialsSource = 'database' | 'environment' | 'mixed'

export type RetsCredentialsForAdmin = RetsCredentials & {
  source: RetsCredentialsSource
  updatedAt: string | null
}

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function fieldSource(
  dbValue: string | null,
  envValue: string | undefined,
): 'database' | 'environment' | null {
  if (trimOrEmpty(dbValue)) return 'database'
  if (trimOrEmpty(envValue)) return 'environment'
  return null
}

function resolveCredentialsSource(): RetsCredentialsSource {
  const sources = new Set<'database' | 'environment'>()

  const serverSource = fieldSource(
    getSyncMeta(RETS_SERVER_URL_KEY),
    process.env.RETS_SERVER_URL,
  )
  const usernameSource = fieldSource(
    getSyncMeta(RETS_USERNAME_KEY),
    process.env.RETS_USERNAME,
  )
  const passwordSource = fieldSource(
    getSyncMeta(RETS_PASSWORD_KEY),
    process.env.RETS_PASSWORD,
  )

  for (const source of [serverSource, usernameSource, passwordSource]) {
    if (source) sources.add(source)
  }

  if (sources.size === 0) return 'environment'
  if (sources.size === 1) return [...sources][0]
  return 'mixed'
}

export function getRetsCredentials(): RetsCredentials {
  return {
    serverUrl:
      trimOrEmpty(getSyncMeta(RETS_SERVER_URL_KEY)) ||
      trimOrEmpty(process.env.RETS_SERVER_URL),
    username:
      trimOrEmpty(getSyncMeta(RETS_USERNAME_KEY)) ||
      trimOrEmpty(process.env.RETS_USERNAME),
    password:
      trimOrEmpty(getSyncMeta(RETS_PASSWORD_KEY)) ||
      trimOrEmpty(process.env.RETS_PASSWORD),
  }
}

export function getRetsCredentialsForAdmin(): RetsCredentialsForAdmin {
  const credentials = getRetsCredentials()
  return {
    ...credentials,
    source: resolveCredentialsSource(),
    updatedAt: getSyncMeta(RETS_CREDENTIALS_UPDATED_AT_KEY),
  }
}

function invalidateRetsHealthCache(): void {
  for (const key of RETS_HEALTH_CACHE_KEYS) {
    deleteSyncMeta(key)
  }
}

export function setRetsCredentials(input: RetsCredentials): RetsCredentialsForAdmin {
  const serverUrl = input.serverUrl.trim()
  const username = input.username.trim()
  const password = input.password.trim()

  if (!serverUrl || !username || !password) {
    throw new Error('RETS server URL, username, and password are required')
  }

  const updatedAt = new Date().toISOString()

  setSyncMeta(RETS_SERVER_URL_KEY, serverUrl)
  setSyncMeta(RETS_USERNAME_KEY, username)
  setSyncMeta(RETS_PASSWORD_KEY, password)
  setSyncMeta(RETS_CREDENTIALS_UPDATED_AT_KEY, updatedAt)

  process.env.RETS_SERVER_URL = serverUrl
  process.env.RETS_USERNAME = username
  process.env.RETS_PASSWORD = password

  invalidateRetsHealthCache()

  return {
    serverUrl,
    username,
    password,
    source: 'database',
    updatedAt,
  }
}
