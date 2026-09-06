import { redirect } from 'next/navigation'
import { isAdminAuthorizedFromCookies } from '@/lib/admin-auth'
import SitePasswordGate from '@/components/SitePasswordGate'
import { VISION_GIS_TOWNS } from '@/lib/vision-gis-towns'
import { townToStreetSlug } from '@/lib/vision-streets-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Streets — TMRE',
  description: 'Official assessor street names by town.',
  robots: { index: false, follow: false },
}

export default async function StreetsIndexPage() {
  const unlocked = await isAdminAuthorizedFromCookies()
  if (!unlocked) {
    return (
      <SitePasswordGate
        title="Streets."
        subtitle="Enter the TMRE password to view the assessor street index."
      />
    )
  }

  const town = VISION_GIS_TOWNS[0]?.town ?? 'Westport'
  redirect(`/streets/${townToStreetSlug(town)}`)
}
