'use client'

import { useEffect } from 'react'
import { publishHeaderScrollOffset } from '@/lib/header-scroll-offset'

/**
 * Publishes `--header-scroll-offset` so `#hash` anchors can clear the
 * fixed site header via `HEADER_SCROLL_MT`.
 */
export default function HeaderScrollOffset() {
  useEffect(() => {
    const update = () => publishHeaderScrollOffset()
    update()
    window.addEventListener('resize', update)
    const header = document.querySelector('header')
    const observer = header ? new ResizeObserver(update) : null
    if (header && observer) observer.observe(header)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [])
  return null
}
