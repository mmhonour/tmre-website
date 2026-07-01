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
      <div className="relative flex min-h-full items-start justify-center px-4 pt-20 pb-10 sm:items-center sm:py-10">
        {children}
      </div>
    </div>,
    document.body,
  );
}
