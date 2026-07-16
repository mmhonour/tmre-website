import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/business-info'

// Served at /sitemap.xml. Curated to the stable, public marketing + tool pages
// (dynamic listing detail routes are intentionally omitted — they change too
// often to enumerate statically and are discoverable via internal links). A
// present, well-formed sitemap is a positive legitimacy signal for crawlers.
const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.8, changeFrequency: 'yearly' },
  { path: '/stats', priority: 0.7, changeFrequency: 'daily' },
  { path: '/new-construction', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/investors', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/open-houses', priority: 0.6, changeFrequency: 'daily' },
  { path: '/find', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/latest', priority: 0.6, changeFrequency: 'daily' },
  { path: '/list-with-me', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
