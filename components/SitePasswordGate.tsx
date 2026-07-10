"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSiteUnlockActions } from "./SiteUnlockProvider";

export default function SitePasswordGate({
  title = "Password required",
  subtitle = "Enter the TMRE access password to continue.",
}: {
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const { setUnlocked } = useSiteUnlockActions();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/site-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Incorrect password");
      }
      setUnlocked(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Restricted
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl">
            {title}
          </h1>
          <p className="mt-4 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed">
            {subtitle}
          </p>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-md px-6 lg:px-10">
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] p-6 sm:p-8 space-y-5"
          >
            <label className="block">
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-charcoal/55">
                Password
              </span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-charcoal/15 bg-cream/40 px-4 py-3 text-navy outline-none focus:border-gold focus:ring-1 focus:ring-gold/40"
                required
              />
            </label>

            {error ? (
              <p className="font-mono text-sm text-coral">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="w-full rounded-full bg-navy text-white font-mono text-[11px] tracking-[0.14em] uppercase px-5 py-3 hover:bg-navy/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
