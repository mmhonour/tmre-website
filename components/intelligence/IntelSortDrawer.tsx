"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Right slide-over for deal-board sort fields (mobile + desktop).
 * Same chrome as the Town stats drawer.
 */
export default function IntelSortDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[180]"
      role="dialog"
      aria-modal
      aria-label="Sort listings"
    >
      <button
        type="button"
        className="absolute inset-0 bg-navy/50 backdrop-blur-[2px] animate-fade-in"
        aria-label="Close sort panel"
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 right-0 flex w-[min(20.5rem,90vw)] max-w-full flex-col bg-cream shadow-[-8px_0_32px_-12px_rgba(0,0,0,0.35)]"
        style={{
          animation: "intelTownStatsSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-charcoal/[0.08] px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy/70 hover:text-navy hover:bg-navy/5 transition-colors"
            aria-label="Hide sort panel"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5"
              fill="currentColor"
              aria-hidden
            >
              <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
            </svg>
            Hide
          </button>
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Sort
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
