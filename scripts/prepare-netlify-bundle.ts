#!/usr/bin/env node
/**
 * Ensure data/listings.bundle.db exists before Netlify packages the site.
 * Copies local listings.db when present; otherwise creates a schema-only DB.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'

const MIN_BYTES = 50_000
const bundlePath = path.join(process.cwd(), 'data', 'listings.bundle.db')
const localDbPath = path.join(process.cwd(), 'data', 'listings.db')

function isUsableDb(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).size >= MIN_BYTES
}

async function createSchemaOnlyBundle(targetPath: string): Promise<void> {
  mkdirSync(path.dirname(targetPath), { recursive: true })
  process.env.LISTINGS_DB_PATH = targetPath
  const { getListingsDb } = await import('../lib/listings-db')
  const db = getListingsDb()
  db.close()
  console.info('[prepare-netlify-bundle] created schema-only bundle:', targetPath)
}

async function main(): Promise<void> {
  if (isUsableDb(bundlePath)) {
    console.info('[prepare-netlify-bundle] bundle already present:', bundlePath)
    return
  }

  if (isUsableDb(localDbPath)) {
    mkdirSync(path.dirname(bundlePath), { recursive: true })
    copyFileSync(localDbPath, bundlePath)
    console.info('[prepare-netlify-bundle] copied listings.db → listings.bundle.db')
    return
  }

  await createSchemaOnlyBundle(bundlePath)
}

main().catch((err) => {
  console.error('[prepare-netlify-bundle] fatal', err)
  process.exit(1)
})
