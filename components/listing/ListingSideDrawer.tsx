"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Phone / narrow: right slide-over for listing Map or Details (same panels as the
 * desktop sidebar). Closed with Hide, backdrop, or Escape; auto-closes at lg+.
 */
export default function ListingSideDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
    <div
      className="fixed inset-0 z-[180] lg:hidden"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-navy/60 backdrop-blur-[2px] animate-fade-in"
        aria-label={`Close ${title}`}
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 right-0 flex w-[min(22rem,92vw)] max-w-full flex-col bg-[#1B2A4A] shadow-[-8px_0_32px_-12px_rgba(0,0,0,0.55)] border-l border-white/10"
        style={{
          animation:
            "intelTownStatsSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={`Hide ${title}`}
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
            {title}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
