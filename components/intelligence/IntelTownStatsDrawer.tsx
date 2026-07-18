"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Phone / narrow: left slide-over for Intelligence town Stats (same panels as the
 * desktop sidebar). Opened from the Live status control; closed with the
 * right-facing chevron or backdrop / Escape.
 */
export default function IntelTownStatsDrawer({
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

  // Auto-close when the desktop sidebar becomes available.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[180] lg:hidden" role="dialog" aria-modal aria-label="Town stats">
      <button
        type="button"
        className="absolute inset-0 bg-navy/50 backdrop-blur-[2px] animate-fade-in"
        aria-label="Close town stats"
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 left-0 flex w-[min(20.5rem,90vw)] max-w-full flex-col bg-cream shadow-[8px_0_32px_-12px_rgba(0,0,0,0.35)]"
        style={{
          animation: "intelTownStatsSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-charcoal/[0.08] px-4 py-3 shrink-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Stats
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy/70 hover:text-navy hover:bg-navy/5 transition-colors"
            aria-label="Hide town stats"
          >
            Hide
            <svg
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5"
              fill="currentColor"
              aria-hidden
            >
              <path d="M3.5 1.2 L9.2 6 L3.5 10.8 Z" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
