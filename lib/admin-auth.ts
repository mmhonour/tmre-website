import 'server-only'

import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { SITE_PASSWORD_COOKIE } from '@/lib/site-password'

export async function isAdminAuthorizedFromCookies(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(SITE_PASSWORD_COOKIE)?.value === '1'
}

export function isAdminAuthorizedRequest(req: NextRequest): boolean {
  return req.cookies.get(SITE_PASSWORD_COOKIE)?.value === '1'
}
