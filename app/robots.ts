import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/business-info'

// Served at /robots.txt. Explicitly welcoming crawlers (and pointing them at
// the sitemap) is one of the signals reputation/categorization services use to
// treat a domain as a real, indexable business site rather than "unknown".
// Password-gated and machine-only paths are disallowed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/visitors', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
