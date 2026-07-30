/**
 * Post-deploy smoke test for the sync function bundle.
 *
 * A dead bundle used to be invisible: the scheduled trigger and background
 * worker crashed at module init, Netlify still returned 202 to the queue hop,
 * and Admin Sync history simply stopped growing (Jul 27 → Jul 30 with nobody
 * noticing). This calls the read-only sync-diagnose Lambda on the fresh deploy
 * and fails the build loudly when the functions cannot even be imported.
 */
const ENDPOINT = '/.netlify/functions/sync-diagnose'
const TIMEOUT_MS = 20_000

export const onSuccess = async ({ utils }) => {
  const base = (
    process.env.DEPLOY_URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    ''
  ).replace(/\/$/, '')

  if (!base) {
    console.warn('[verify-sync-functions] no deploy URL available — skipped')
    return
  }

  const secret = process.env.SYNC_CRON_SECRET?.trim()
  const url = `${base}${ENDPOINT}?mode=defer-check`

  let status = null
  let body = ''
  try {
    const res = await fetch(url, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
    body = (await res.text()).slice(0, 600)
  } catch (err) {
    utils.build.failPlugin(
      `sync-diagnose unreachable at ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return
  }

  // 401 still proves the bundle imports cleanly (auth ran), which is what this
  // guard is about; a module-init crash surfaces as 502 with errorType.
  if (status === 200 || status === 401) {
    console.info(
      `[verify-sync-functions] OK — sync function bundle loads (HTTP ${status})`,
    )
    return
  }

  utils.build.failPlugin(
    `sync function bundle is broken — ${ENDPOINT} returned HTTP ${status}. ` +
      `Scheduled syncs and background workers will silently do nothing. Response: ${body}`,
  )
}
