#!/usr/bin/env node
/**
 * Netlify build prep — listing-photos SQLite only.
 * MLS inventory lives in Neon Postgres; listings.bundle.db is no longer shipped.
 */
async function main(): Promise<void> {
  try {
    await import('better-sqlite3')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `better-sqlite3 unavailable during Netlify bundle prep (run npm rebuild better-sqlite3 first): ${detail}`,
    )
  }

  console.info(
    '[prepare-netlify-bundle] skipped listings.bundle.db — MLS inventory is in Neon Postgres; listing-photos.db hydrates from blobs at runtime',
  )
}

main().catch((err) => {
  console.error('[prepare-netlify-bundle] fatal', err)
  process.exit(1)
})
