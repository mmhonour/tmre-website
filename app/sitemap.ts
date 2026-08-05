import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/business-info'
import { SITE_PAGES } from '@/lib/site-pages'

// Served at /sitemap.xml. The page list lives in lib/site-pages.ts because the
// Site menu picker (Admin → Web server → Site menu) offers the same set —
// keeping one list means a new page is crawlable and menu-addable at once.
// Dynamic listing detail routes are intentionally omitted: they change too
// often to enumerate statically and are discoverable via internal links.

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return SITE_PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
