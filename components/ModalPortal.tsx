"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

let modalLockCount = 0;

function lockBodyScroll() {
  if (modalLockCount === 0) {
    document.body.dataset.modalPrevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  modalLockCount += 1;
}

function unlockBodyScroll() {
  modalLockCount = Math.max(0, modalLockCount - 1);
  if (modalLockCount === 0) {
    document.body.style.overflow = document.body.dataset.modalPrevOverflow ?? "";
    delete document.body.dataset.modalPrevOverflow;
  }
}

/**
 * Shared panel chrome for modals rendered inside ModalPortal.
 * Mobile: tighter padding + dvh max-height so content stays on-screen (esp. iOS
 * dynamic browser chrome). Desktop: previous centered card look.
 */
export const MODAL_PANEL_CLASS =
  "relative bg-white w-full max-w-md rounded-t-3xl rounded-b-2xl sm:rounded-3xl " +
  "shadow-2xl shadow-navy/20 p-5 sm:p-8 " +
  "max-h-[min(92dvh,calc(100dvh-1rem))] sm:max-h-[min(85vh,calc(100vh-5rem))] " +
  "overflow-y-auto overscroll-contain";

export const MODAL_PANEL_WIDE_CLASS = MODAL_PANEL_CLASS.replace(
  "max-w-md",
  "max-w-lg",
);

/** Full-viewport modal shell — portals to body to escape overflow/stacking ancestors. */
export default function ModalPortal({
  open,
  onClose,
  ariaLabel,
  children,
  zClass = "z-[200]",
}: {
  open: boolean;
  onClose?: () => void;
  ariaLabel: string;
  children: ReactNode;
  zClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open || !onClose) return;
    const close = onClose;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} overflow-y-auto overscroll-contain`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 bg-navy/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/*
        Mobile: pin to bottom (bottom-sheet) so tall score panels stay in the
        visible viewport. Desktop: center as before.
        Use 100dvh — 100vh overshoots on phones with collapsing browser chrome.
      */}
      <div
        className={
          "relative flex min-h-[100dvh] items-end justify-center " +
          "px-3 pt-[max(0.5rem,env(safe-area-inset-top))] " +
          "pb-[max(0.5rem,env(safe-area-inset-bottom))] " +
          "sm:items-center sm:px-4 sm:py-10"
        }
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
