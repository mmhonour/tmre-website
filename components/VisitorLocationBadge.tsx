'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVisitorLocation } from '@/hooks/useVisitorLocation'
import { useSiteUnlocked } from '@/components/SiteUnlockProvider'
import {
  clearVisitorPostalOverride,
  dismissZipPillGlow,
  isZipPillGlowDismissed,
  resetVisitorPostalToInferred,
  setVisitorPostalOverride,
  townFromPostal,
} from '@/lib/visitor-location'
import {
  clearGeoDenied,
  refineVisitorLocationFromWifi,
} from '@/lib/visitor-wifi-location'

const EMPTY_LOCATION = {
  town: null as string | null,
  postal: null as string | null,
  confirmed: false,
  cleared: false,
}

export default function VisitorLocationBadge({
  className = '',
  showPreciseLocation: showPreciseLocationProp,
}: {
  className?: string
  /** Preview override. Live header uses the site-password unlock. */
  showPreciseLocation?: boolean
}) {
  const { location: resolved, refresh } = useVisitorLocation()
  const location = resolved ?? EMPTY_LOCATION
  const siteUnlocked = useSiteUnlocked()
  const showPreciseLocation = showPreciseLocationProp ?? siteUnlocked
  const [glow, setGlow] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{
    top: number
    left: number
    placeAbove: boolean
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogId = useId()

  useEffect(() => {
    setGlow(!isZipPillGlowDismissed())
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setPos(null)
        setError(null)
      }
    }
    const onScrollOrResize = () => {
      const el = btnRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const popH = 340
      const popW = 260
      const placeAbove = rect.top >= popH + 12
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - popW / 2),
        window.innerWidth - popW - 8,
      )
      setPos({
        top: placeAbove ? rect.top - 8 : rect.bottom + 8,
        left,
        placeAbove,
      })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
      setPos(null)
      setError(null)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  const label = location.cleared ? 'ZIP' : (location.postal ?? location.town)
  const display = label ?? 'ZIP'
  const title = location.cleared
    ? 'ZIP cleared — click to set, or reset to the detected ZIP'
    : location.town
      ? location.postal
        ? `${location.postal} · ${location.town}, CT`
        : `${location.town}, CT`
      : location.postal
        ? `ZIP ${location.postal}`
        : 'Set your ZIP'

  const draftTown = townFromPostal(draft)

  function placePopover() {
    const el = btnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const popH = 340
    const popW = 260
    const placeAbove = rect.top >= popH + 12
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - popW / 2),
      window.innerWidth - popW - 8,
    )
    setPos({
      top: placeAbove ? rect.top - 8 : rect.bottom + 8,
      left,
      placeAbove,
    })
  }

  function openPopover() {
    dismissZipPillGlow()
    setGlow(false)
    setDraft(location.postal ?? '')
    setError(null)
    setOpen(true)
    requestAnimationFrame(() => {
      placePopover()
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function closePopover() {
    setOpen(false)
    setPos(null)
    setError(null)
    setBusy(false)
  }

  function saveZip(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 5)
    if (digits.length !== 5) {
      setError('Enter a 5-digit ZIP')
      return
    }
    setVisitorPostalOverride(digits)
    void refresh()
    closePopover()
  }

  function clearZip() {
    clearVisitorPostalOverride()
    void refresh()
    closePopover()
  }

  async function resetZip() {
    setBusy(true)
    setError(null)
    try {
      clearGeoDenied()
      await resetVisitorPostalToInferred()
      closePopover()
    } catch {
      setBusy(false)
      setError('Could not detect a ZIP — enter one or clear it')
    }
  }

  async function usePreciseLocation() {
    setBusy(true)
    setError(null)
    clearGeoDenied()
    try {
      const next = await refineVisitorLocationFromWifi(true)
      if (!next?.postal) {
        setBusy(false)
        setError('Location was blocked or unavailable — enter a ZIP')
        return
      }
      closePopover()
    } catch {
      setBusy(false)
      setError('Location was blocked or unavailable — enter a ZIP')
    }
  }

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closePopover() : openPopover())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        title={title}
        className={`visitor-zip-pill group relative inline-flex cursor-pointer rounded-full p-[1.5px] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
          glow ? 'visitor-zip-pill--glow' : ''
        } ${location.confirmed && !location.cleared ? 'visitor-zip-pill--confirmed' : ''}`}
      >
        {glow ? <span className="visitor-zip-pill__ring" aria-hidden /> : null}
        <span className="relative z-[1] inline-flex items-center rounded-full border border-white/15 bg-navy-dark/95 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/80 group-hover:text-white">
          {display}
        </span>
      </button>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popRef}
              id={dialogId}
              role="dialog"
              aria-label="Change your ZIP code"
              className="fixed z-[80] w-[260px] rounded-xl border border-charcoal/10 bg-cream shadow-lg shadow-charcoal/15"
              style={
                pos.placeAbove
                  ? {
                      bottom: window.innerHeight - (btnRef.current?.getBoundingClientRect().top ?? 0) + 8,
                      left: pos.left,
                    }
                  : { top: pos.top, left: pos.left }
              }
            >
              <div className="border-b border-charcoal/[0.08] px-3.5 py-2.5">
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
                  Your ZIP
                </p>
                <p className="mt-0.5 text-xs text-charcoal/60 leading-snug">
                  {location.cleared
                    ? showPreciseLocation
                      ? 'ZIP is cleared. Set one, use precise location, or reset.'
                      : 'ZIP is cleared. Set one or reset.'
                    : location.confirmed
                      ? 'Change, clear, or reset the ZIP used for towns and filters.'
                      : showPreciseLocation
                        ? 'IP ZIP is the cable block, not your house. Type 06880, or Use precise location if Chrome location is on.'
                        : 'Type your ZIP (for example 06880). The number we detect from your internet connection can be the cable block, not the house.'}
                </p>
              </div>
              <form
                className="space-y-3 px-3.5 py-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveZip(draft)
                }}
              >
                <label className="block">
                  <span className="sr-only">ZIP code</span>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={5}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value.replace(/\D/g, '').slice(0, 5))
                      setError(null)
                    }}
                    placeholder="06880"
                    className="w-full rounded-lg border border-charcoal/15 bg-white px-3 py-2 font-mono text-sm tracking-[0.2em] text-navy outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30"
                  />
                </label>
                {draftTown ? (
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-sage">
                    {draftTown}, CT
                  </p>
                ) : draft.length === 5 ? (
                  <p className="text-[11px] text-charcoal/45">
                    Outside TMRE towns — still saved
                  </p>
                ) : null}
                {error ? <p className="text-[11px] text-coral">{error}</p> : null}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-navy px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-white hover:bg-navy-light"
                  >
                    {location.postal && draft === location.postal ? 'Confirm' : 'Save ZIP'}
                  </button>
                  <button
                    type="button"
                    onClick={closePopover}
                    className="rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/55 hover:text-navy"
                  >
                    Cancel
                  </button>
                </div>
                {showPreciseLocation ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void usePreciseLocation()}
                      disabled={busy}
                      className="flex-1 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-gold/20 disabled:opacity-40"
                    >
                      {busy ? 'Locating…' : 'Use precise location'}
                    </button>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearZip}
                    disabled={busy || (!location.postal && !location.cleared && !draft)}
                    className="flex-1 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/70 hover:text-navy disabled:opacity-40"
                  >
                    Clear ZIP
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetZip()}
                    disabled={busy}
                    title="Go back to the ZIP from your internet connection"
                    className="flex-1 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/70 hover:text-navy disabled:opacity-40"
                  >
                    {busy ? 'Reset…' : 'Reset'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
