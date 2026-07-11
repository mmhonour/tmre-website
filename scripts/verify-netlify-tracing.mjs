#!/usr/bin/env node
/**
 * Post-build check: ensure Netlify-critical files appear in Next.js trace manifests.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SERVER_APP = path.join(ROOT, '.next', 'server', 'app')
const BUNDLE_PATH = path.join(ROOT, 'data', 'listings.bundle.db')
const SQLITE_GLOBS = [
  'node_modules/better-sqlite3',
  'node_modules/bindings',
]

function collectNftFiles(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectNftFiles(full))
    else if (entry.name.endsWith('.nft.json')) out.push(full)
  }
  return out
}

function tracedPaths(nftPath) {
  const raw = JSON.parse(readFileSync(nftPath, 'utf8'))
  const files = Array.isArray(raw.files) ? raw.files : []
  return files.map((f) => f.replace(/\\/g, '/'))
}

function main() {
  const issues = []

  if (!existsSync(BUNDLE_PATH)) {
    issues.push('data/listings.bundle.db missing — run prepare-netlify-bundle first')
  } else if (statSync(BUNDLE_PATH).size < 50_000) {
    issues.push(`data/listings.bundle.db too small (${statSync(BUNDLE_PATH).size} bytes)`)
  }

  const nftFiles = collectNftFiles(SERVER_APP)
  if (nftFiles.length === 0) {
    issues.push('.next/server/app trace manifests not found — was next build run?')
  } else {
    const adminNft = nftFiles.find((f) => f.replace(/\\/g, '/').includes('/admin/page.nft.json'))
    const sample = adminNft ?? nftFiles[0]
    const traced = new Set(tracedPaths(sample))

    if (![...traced].some((p) => p.includes('data/listings.bundle.db'))) {
      issues.push(`bundle not traced in ${path.relative(ROOT, sample)}`)
    }
    for (const needle of SQLITE_GLOBS) {
      if (![...traced].some((p) => p.includes(needle))) {
        issues.push(`${needle} not traced in ${path.relative(ROOT, sample)}`)
      }
    }
  }

  if (issues.length > 0) {
    console.error('[verify-netlify-tracing] FAILED:')
    for (const issue of issues) console.error(`  - ${issue}`)
    process.exit(1)
  }

  console.info('[verify-netlify-tracing] OK — bundle and better-sqlite3 traced for serverless')
}

main()
