import * as rets from 'rets-client'

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'probe-closed/0.1',
}

const queries = [
  '(MLSStatus=|C),(City=|540)',
  '(MLSStatus=|C),(City=540)',
  '(MLSStatus=C),(City=|540)',
  '(StatusChangeTimestamp=2024-01-01+),(City=|540)',
  '(CloseDate=2024-01-01+),(City=|540)',
  '(MLSStatus=|A),(City=|540)',
]

;(rets as any).getAutoLogoutClient(settings, async (client: any) => {
  for (const q of queries) {
    try {
      const r = await client.search.query('Property', 'Property', q, {
        limit: 3,
        offset: 1,
      })
      console.log('OK', q, r.results?.length ?? 0)
    } catch (err: any) {
      console.log('ERR', q, err.replyCode, err.replyText)
    }
  }
})
