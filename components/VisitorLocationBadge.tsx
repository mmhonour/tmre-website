'use client'

import { useVisitorLocation } from '@/hooks/useVisitorLocation'

export default function VisitorLocationBadge({
  className = '',
}: {
  className?: string
}) {
  const location = useVisitorLocation()
  if (!location?.postal && !location?.town) return null

  const label = location.postal ?? location.town ?? ''
  const title = location.town
    ? location.postal
      ? `${location.postal} · ${location.town}, CT`
      : `${location.town}, CT`
    : undefined

  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/70 shrink-0 ${className}`}
      title={title}
    >
      {label}
    </span>
  )
}
