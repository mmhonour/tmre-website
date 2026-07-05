"use client";

import { useEffect, useRef, useState } from "react";
import ContactFormPanel from "./ContactFormPanel";
import { navIconClass } from "./icons";

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? navIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ContactButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Email me"
        className={
          className ??
          "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-white/50 hover:text-gold transition-colors"
        }
      >
        <MailIcon className={navIconClass} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-navy border border-white/10 shadow-2xl shadow-black/40 p-4 z-50">
          <ContactFormPanel
            source="nav-contact"
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
