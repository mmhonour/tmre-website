"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listingPhotoObfuscationImgClass,
  ListingPhotoObfuscationOverlay,
} from "@/components/listing/ListingPhotoObfuscation";

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
  obfuscatePhoto,
}: {
  photos: readonly string[];
  index: number;
  altBase: string;
  onClose: () => void;
  onStep: (delta: number) => void;
  obfuscatePhoto?: (photoIndex: number) => boolean;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const src = photos[index];
  const total = photos.length;
  const obfuscate = obfuscatePhoto?.(index) ?? false;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  if (typeof document === "undefined" || !src) return null;

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
        alt={`${altBase} — photo ${index + 1} of ${total}`}
        className={listingPhotoObfuscationImgClass(
          obfuscate,
          "h-full w-full object-contain",
        )}
        draggable={false}
      />
      {obfuscate ? <ListingPhotoObfuscationOverlay /> : null}
      {total > 1 ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] text-center font-mono text-[11px] tracking-[0.2em] text-white/70 tabular-nums">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </p>
      ) : null}
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
