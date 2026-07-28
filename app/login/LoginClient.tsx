"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next")?.trim() || "/latest";
  const errorCode = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [me, setMe] = useState<{ email: string; name: string | null } | null>(
    null,
  );

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { authenticated?: boolean; user?: { email: string; name: string | null } }) => {
        if (body.authenticated && body.user) setMe(body.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (errorCode === "expired" || errorCode === "missing") {
      setMessage("That sign-in link expired or was already used. Request a new one.");
      setStatus("error");
    } else if (errorCode === "failed") {
      setMessage("Could not complete sign-in. Try again.");
      setStatus("error");
    }
  }, [errorCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          next,
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "Could not send link");
        return;
      }
      setStatus("sent");
      setMessage(body.message ?? "Check your email for a sign-in link.");
    } catch {
      setStatus("error");
      setMessage("Could not send link");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
  };

  return (
    <main className="bg-cream min-h-[70vh] pt-28 pb-16 lg:pt-36">
      <div className="mx-auto max-w-md px-6 lg:px-10">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
          Account
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-navy leading-tight">
          Sign in
        </h1>
        <p className="mt-3 text-slate text-sm leading-relaxed">
          Passwordless — we email you a one-time link. No password to remember.
          Used for listing alerts and I&apos;m interested so we can recognize you
          next time.
        </p>

        {me ? (
          <div className="mt-8 rounded-2xl border border-charcoal/[0.08] bg-white p-6 space-y-4">
            <p className="font-serif text-lg text-navy">
              Signed in as {me.name?.trim() || me.email}
            </p>
            <p className="font-mono text-xs text-slate">{me.email}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={next.startsWith("/") ? next : "/latest"}
                className="inline-flex rounded-full bg-gold px-4 py-2 font-mono text-[11px] tracking-[0.12em] uppercase text-navy"
              >
                Continue
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex rounded-full border border-charcoal/15 px-4 py-2 font-mono text-[11px] tracking-[0.12em] uppercase text-slate hover:text-navy"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mt-8 rounded-2xl border border-charcoal/[0.08] bg-white p-6 space-y-4"
          >
            <label className="block">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-charcoal/15 bg-cream/40 px-3 py-2 text-sm text-navy focus:outline-none focus:border-gold/50"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate">
                Name <span className="normal-case tracking-normal">(optional)</span>
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-charcoal/15 bg-cream/40 px-3 py-2 text-sm text-navy focus:outline-none focus:border-gold/50"
                placeholder="First Last"
                autoComplete="name"
              />
            </label>
            {message ? (
              <p
                className={`font-mono text-[11px] leading-relaxed ${
                  status === "error" ? "text-coral" : "text-sage"
                }`}
              >
                {message}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={status === "sending" || status === "sent"}
              className="w-full rounded-full bg-navy px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-white hover:bg-navy/90 disabled:opacity-50"
            >
              {status === "sending"
                ? "Sending…"
                : status === "sent"
                  ? "Link sent"
                  : "Email me a sign-in link"}
            </button>
          </form>
        )}

        <p className="mt-6 font-mono text-[10px] text-slate/70">
          <Link href="/latest" className="underline underline-offset-2 hover:text-navy">
            Back to Latest
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
