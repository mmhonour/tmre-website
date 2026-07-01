"use client";

import { useMemo, useState } from "react";
import { formatTownList } from "@/lib/tmre-towns";

type AudienceType = "seller" | "buyer" | "investor" | "contractor";

const AUDIENCE_OPTIONS: { value: AudienceType; label: string }[] = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "investor", label: "Investor" },
  { value: "contractor", label: "Contractor" },
];

function townFromZip(zip: string): string | null {
  if (/^0685[0-5]$/.test(zip)) return "Norwalk";
  if (zip === "06880" || zip === "06838") return "Westport";
  return null;
}

type Status = "idle" | "submitting" | "success" | "error";

export default function LeadForm({ source = "home-cta" }: { source?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [audience, setAudience] = useState<AudienceType>("buyer");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detectedTown = useMemo(() => townFromZip(zip.trim()), [zip]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          zip: zip.trim(),
          audience_type: audience,
          source,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setStatus("success");
      setName("");
      setEmail("");
      setZip("");
      setAudience("buyer");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "success") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-gold/30 bg-white/[0.06] backdrop-blur-sm p-8 text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
          You're in
        </p>
        <h3 className="font-serif text-2xl text-white leading-snug">
          Welcome to the brief.
        </h3>
        <p className="mt-3 text-sm text-white/70 leading-relaxed">
          Look for the next edition in your inbox Monday morning —{" "}
          {formatTownList(["Norwalk", "Westport"])} intel, deals scored, the chart that mattered.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-gold-light transition-colors"
        >
          Submit another →
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-md text-left space-y-3"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Zip"
          hint={detectedTown ? `Detected · ${detectedTown}` : undefined}
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            required
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="06850"
            className={inputClass}
          />
        </Field>
        <Field label="I am a…">
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AudienceType)}
            className={`${inputClass} appearance-none cursor-pointer`}
          >
            {AUDIENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-navy">
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-6 py-3.5 text-sm font-medium text-navy transition-all hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? "Sending…" : "Join the brief"}
      </button>

      {status === "error" && errorMsg && (
        <p className="font-mono text-[11px] tracking-wide text-coral text-center">
          {errorMsg}
        </p>
      )}
      <p className="text-center font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
        No spam · Unsubscribe in one click
      </p>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-gold focus:bg-white/15 transition-colors";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-gold/80">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}
