#!/usr/bin/env node
/**
 * Build-time guard for the crash that silenced production syncs from Jul 27:
 * upstream `server-only` resolves to a throwing module under plain Node, so
 * every netlify/functions handler died at module init (Next.js is unaffected
 * because its server build asks for the `react-server` condition).
 *
 * Asserts the vendored shim is installed: inert under Node, still throwing for
 * browser bundles. Run before `next build` in build:netlify.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const issues = []

let pkgPath = null
try {
  pkgPath = require.resolve('server-only/package.json')
} catch {
  issues.push('server-only is not installed — run npm install')
}

if (pkgPath) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const browserCondition = pkg.exports?.['.']?.browser
  const nodeCondition = pkg.exports?.['.']?.default

  if (!browserCondition) {
    issues.push(
      'server-only has no `browser` export condition — the client-bundle guardrail is gone',
    )
  }
  if (!nodeCondition) {
    issues.push('server-only has no `default` export condition for Node')
  }

  // The real test: importing it the way a Netlify Lambda does must not throw.
  try {
    require('server-only')
  } catch (err) {
    issues.push(
      `importing server-only under Node threw (${
        err instanceof Error ? err.message : String(err)
      }) — netlify/functions will crash at module init`,
    )
  }

  // And the browser build must still blow up on a server-only module.
  if (browserCondition) {
    const throwFile = path.join(path.dirname(pkgPath), browserCondition)
    try {
      const source = readFileSync(throwFile, 'utf8')
      if (!/throw\s+new\s+Error/.test(source)) {
        issues.push(
          `${browserCondition} does not throw — a server module could reach a Client Component unnoticed`,
        )
      }
    } catch {
      issues.push(`${browserCondition} is missing from the server-only package`)
    }
  }
}

if (issues.length > 0) {
  console.error('[verify-server-only-shim] FAILED:')
  for (const issue of issues) console.error(`  - ${issue}`)
  process.exit(1)
}

console.info(
  '[verify-server-only-shim] OK — inert under Node (Lambdas safe), still throwing for browser bundles',
)
