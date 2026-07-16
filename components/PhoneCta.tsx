"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneIcon, navIconClass } from "./icons";
import { AGENT_PHONE_DISPLAY, AGENT_PHONE_TEL } from "@/lib/business-info";

// ---------------------------------------------------------------------------
// Phone call-to-action that adapts to the device.
//
//   • Touch / phone-capable devices  → a real `tel:` link, so a tap dials.
//   • Desktop (no dialer app)        → clicking reveals the number as plain,
//                                       selectable text + a copy button. This
//                                       avoids the browser's "choose an app to
//                                       make a call?" prompt when nothing can
//                                       actually place the call.
//
// There is no reliable browser API for "is a calling app installed", so we use
// the standard heuristic: a coarse pointer with no hover ≈ a phone/tablet.
// ---------------------------------------------------------------------------

export default function PhoneCta({
  className,
  align = "center",
  phone,
}: {
  className: string;
  align?: "center" | "start";
  /** Live number from admin config; falls back to the built-in default. */
  phone?: { tel: string; display: string };
}) {
  const tel = phone?.tel ?? AGENT_PHONE_TEL;
  const display = phone?.display ?? AGENT_PHONE_DISPLAY;
  // Assume desktop for SSR + first paint (matches server render → no hydration
  // mismatch); flip to call-capable on mount for touch devices.
  const [canCall, setCanCall] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setCanCall(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setRevealed(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRevealed(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [revealed]);

  // Touch device: dial directly.
  if (canCall) {
    return (
      <a href={`tel:${tel}`} className={className} aria-label="Call me">
        <PhoneIcon className={navIconClass} />
      </a>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the number is still shown for manual copy.
    }
  };

  return (
    <div
      ref={ref}
      className={`relative flex w-full flex-col ${
        align === "start" ? "items-start" : "items-center"
      }`}
    >
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className={className}
        aria-label={revealed ? "Hide phone number" : "Show phone number"}
        aria-expanded={revealed}
      >
        <PhoneIcon className={navIconClass} />
      </button>

      {revealed ? (
        <div
          className={`absolute top-full z-50 mt-2 flex items-center gap-2 rounded-full border border-charcoal/[0.1] bg-white px-3 py-1.5 shadow-lg shadow-navy/10 ${
            align === "start" ? "left-0" : "left-1/2 -translate-x-1/2"
          }`}
          role="dialog"
          aria-label="Phone number"
        >
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-navy select-all">
            {display}
          </span>
          <button
            type="button"
            onClick={() => void copy()}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-gold hover:text-navy transition-colors"
            aria-label="Copy phone number"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
