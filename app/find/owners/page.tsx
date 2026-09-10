import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Owners — Streets — TMRE',
  robots: { index: false, follow: false },
}

/** Owner aggregation is Admin / Streets only. */
export default function FindOwnersRedirectPage() {
  redirect('/streets/owners')
}
