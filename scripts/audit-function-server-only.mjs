#!/usr/bin/env node
/**
 * Lists every local module reachable from `netlify/functions/*` that imports
 * `server-only`. Those imports resolve to the throwing build inside a plain
 * Netlify Lambda (Next.js swaps in an empty module via the react-server
 * condition), so each one crashes the function at module init.
 *
 *   node scripts/audit-function-server-only.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions')
const EXTS = ['.ts', '.tsx', '.mts', '.js', '.mjs']

function resolveLocal(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null

  for (const ext of ['', ...EXTS]) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  for (const ext of EXTS) {
    const candidate = path.join(base, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function specsOf(source) {
  const out = []
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (spec) out.push(spec)
  }
  return out
}

const seen = new Set()
const offenders = new Map() // file -> entry functions that reach it

function walk(file, entry) {
  const key = path.relative(ROOT, file).replace(/\\/g, '/')
  const source = readFileSync(file, 'utf8')

  if (/^\s*import\s+['"]server-only['"]/m.test(source)) {
    const list = offenders.get(key) ?? new Set()
    list.add(entry)
    offenders.set(key, list)
  }

  const visitKey = `${entry}::${key}`
  if (seen.has(visitKey)) return
  seen.add(visitKey)

  for (const spec of specsOf(source)) {
    if (spec === 'server-only') continue
    const next = resolveLocal(spec, file)
    if (next) walk(next, entry)
  }
}

const entries = readdirSync(FUNCTIONS_DIR)
  .filter((name) => EXTS.some((ext) => name.endsWith(ext)))
  .sort()

for (const name of entries) walk(path.join(FUNCTIONS_DIR, name), name)

const sorted = [...offenders.entries()].sort((a, b) => a[0].localeCompare(b[0]))
console.log(`Netlify function entrypoints scanned: ${entries.length}`)
console.log(`Modules importing 'server-only' in that graph: ${sorted.length}\n`)
for (const [file, fns] of sorted) {
  console.log(`${file}\n    via: ${[...fns].sort().join(', ')}`)
}
