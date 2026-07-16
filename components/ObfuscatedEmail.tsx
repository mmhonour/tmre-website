"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Anti-harvest email display.
//
// The address is stored as two separate parts and only joined in the browser
// AFTER a user click — so the server-rendered HTML (what scraper bots actually
// crawl) never contains "user@domain" as a string, and the parts never appear
// contiguously in the JS bundle either. Humans get a one-click reveal + copy;
// bots that don't execute JS (the vast majority of harvesters) get nothing.
// ---------------------------------------------------------------------------

const USER = "tmarks";
const DOMAIN = "bhhsne.com";

export default function ObfuscatedEmail({
  buttonClassName,
  linkClassName,
}: {
  buttonClassName?: string;
  linkClassName?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const address = `${USER}@${DOMAIN}`;

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className={
          buttonClassName ??
          "text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold transition-colors"
        }
        aria-label="Show email address"
      >
        Show email address
      </button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the address is still shown for manual copy.
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href={`mailto:${address}`}
        className={
          linkClassName ??
          "text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold transition-colors"
        }
      >
        {address}
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-gold hover:text-navy transition-colors"
        aria-label="Copy email address"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
