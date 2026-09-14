"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listingPhotoObfuscationImgClass,
  ListingPhotoObfuscationOverlay,
} from "@/components/listing/ListingPhotoObfuscation";
import { loadTabJson } from "@/lib/tab-data-prefetch";

function FocusNavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-11 min-w-11 items-center justify-center px-2 font-mono text-xl leading-none text-white transition-colors hover:text-gold disabled:text-white/25"
    >
      {children}
    </button>
  );
}

/**
 * Mobile full-screen listing photo. Covers the site header and all full-bleed
 * chrome; Close (or Escape) returns to the page.
 */
export default function ShowcasePhotoFocus({
  photos,
  index,
  altBase,
  onClose,
  onStep,
  onGoTo,
  captions,
  captionsUrl,
  obfuscatePhoto,
}: {
  photos: readonly string[];
  index: number;
  altBase: string;
  onClose: () => void;
  onStep: (delta: number) => void;
  onGoTo?: (photoIndex: number) => void;
  /** Same order as `photos`. Preview and tests can pass these directly. */
  captions?: readonly (string | null)[];
  /** Listing Media captions — fetched when the overlay opens. */
  captionsUrl?: string | null;
  obfuscatePhoto?: (photoIndex: number) => boolean;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [remoteCaptions, setRemoteCaptions] = useState<
    readonly (string | null)[] | null
  >(null);
  const src = photos[index];
  const total = photos.length;
  const obfuscate = obfuscatePhoto?.(index) ?? false;
  const caption =
    (captions?.[index] ?? remoteCaptions?.[index])?.trim() || null;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const url = captionsUrl?.trim();
    if (!url || captions) return;
    let cancelled = false;
    void loadTabJson<{ captions?: (string | null)[] }>(url)
      .then((data) => {
        if (!cancelled) setRemoteCaptions(data?.captions ?? []);
      })
      .catch(() => {
        if (!cancelled) setRemoteCaptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [captions, captionsUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onStep(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onStep(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        onGoTo?.(0);
      } else if (event.key === "End") {
        event.preventDefault();
        onGoTo?.(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onGoTo, onStep, total]);

  if (typeof document === "undefined" || !src) return null;

  const goTo = onGoTo ?? ((photoIndex: number) => onStep(photoIndex - index));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full screen photo"
      className="fixed inset-0 z-[80] bg-black"
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        startRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = startRef.current;
        const touch = event.changedTouches[0];
        startRef.current = null;
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) {
          onClose();
          return;
        }
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          onStep(dx > 0 ? -1 : 1);
        }
      }}
    >
      <button
        type="button"
        autoFocus
        onClick={onClose}
        className="absolute left-4 z-[81] pt-[max(1rem,env(safe-area-inset-top))] font-mono text-[11px] uppercase tracking-[0.2em] text-white underline decoration-white/40 underline-offset-4"
      >
        Close
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={
          caption
            ? `${altBase} — ${caption}`
            : `${altBase} — photo ${index + 1} of ${total}`
        }
        className={listingPhotoObfuscationImgClass(
          obfuscate,
          "h-full w-full object-contain",
        )}
        draggable={false}
      />
      {obfuscate ? <ListingPhotoObfuscationOverlay /> : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[81] bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
        {caption ? (
          <p className="mb-3 line-clamp-3 text-center font-serif text-lg leading-snug text-white">
            {caption}
          </p>
        ) : null}
        {total > 1 ? (
          <div className="pointer-events-auto flex items-center justify-center gap-0.5">
            <FocusNavButton
              label="First photo"
              disabled={index === 0}
              onClick={() => goTo(0)}
            >
              «
            </FocusNavButton>
            <FocusNavButton
              label="Previous photo"
              onClick={() => onStep(-1)}
            >
              ‹
            </FocusNavButton>
            <p className="min-w-[5.5rem] text-center font-mono text-[11px] tracking-[0.2em] text-white/70 tabular-nums">
              {String(index + 1).padStart(2, "0")} /{" "}
              {String(total).padStart(2, "0")}
            </p>
            <FocusNavButton label="Next photo" onClick={() => onStep(1)}>
              ›
            </FocusNavButton>
            <FocusNavButton
              label="Last photo"
              disabled={index === total - 1}
              onClick={() => goTo(total - 1)}
            >
              »
            </FocusNavButton>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function isShowcasePhoneViewport(): boolean {
  return !window.matchMedia("(min-width: 1024px)").matches;
}

/** Live `lg` breakpoint — same cut as `isShowcasePhoneViewport`. */
export function useShowcasePhoneViewport(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setPhone(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return phone;
}
