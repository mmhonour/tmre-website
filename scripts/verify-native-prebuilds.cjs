#!/usr/bin/env node
/**
 * Fail Netlify builds when better-sqlite3 was compiled on Noble instead of using a prebuild.
 * Lambda (Amazon Linux) ships an older glibc than Netlify's Ubuntu 24 build image.
 */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const BETTER_SQLITE_NODE = path.join(
  process.cwd(),
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
)

function maxGlibcVersion(binaryPath) {
  if (process.platform !== 'linux') {
    console.info('[verify-native] skipping GLIBC probe on', process.platform)
    return null
  }

  let output = ''
  try {
    output = execSync(`strings "${binaryPath}"`, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch {
    return null
  }

  const versions = [...output.matchAll(/GLIBC_(\d+(?:\.\d+)?)/g)].map((match) =>
    parseFloat(match[1]),
  )
  if (versions.length === 0) return null
  return Math.max(...versions)
}

function main() {
  if (!fs.existsSync(BETTER_SQLITE_NODE)) {
    console.error('[verify-native] missing prebuild binary:', BETTER_SQLITE_NODE)
    process.exit(1)
  }

  const maxGlibc = maxGlibcVersion(BETTER_SQLITE_NODE)
  if (maxGlibc != null && maxGlibc >= 2.38) {
    console.error(
      `[verify-native] ${BETTER_SQLITE_NODE} requires GLIBC_${maxGlibc} — compiled on Noble, not a Lambda-compatible prebuild.`,
    )
    console.error('[verify-native] Delete node_modules/better-sqlite3/build and rerun prebuild-install.')
    process.exit(1)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('better-sqlite3')
    console.info('[verify-native] better-sqlite3 loads OK')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[verify-native] better-sqlite3 require failed:', detail)
    process.exit(1)
  }
}

main()
