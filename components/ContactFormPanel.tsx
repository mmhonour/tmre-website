"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatUsPhoneInput,
  FULL_NAME_PATTERN,
  US_PHONE_PATTERN,
  validateContactFields,
  type ContactFieldErrors,
} from "@/lib/contact-form-validation";

type FormState = "idle" | "submitting" | "done" | "error" | "captcha-fail";

type Challenge = { a: number; b: number; op: "+" | "−"; answer: number };

function newChallenge(): Challenge {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const useAdd = Math.random() > 0.4;
  if (useAdd) return { a, b, op: "+", answer: a + b };
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return { a: hi, b: lo, op: "−", answer: hi - lo };
}

const inputClass =
  "rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none focus:border-gold/50 transition-colors w-full";

function fieldErrorClass(hasError: boolean): string {
  return hasError ? "border-coral/60 focus:border-coral" : "";
}

export default function ContactFormPanel({
  source,
  listingInfo = null,
  title = "Get in touch",
  onDone,
  onClose,
}: {
  source: string;
  listingInfo?: string | null;
  title?: string;
  onDone?: () => void;
  onClose?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [captcha, setCaptcha] = useState(newChallenge);
  const [captchaVal, setCaptchaVal] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");

  const refreshCaptcha = useCallback(() => {
    setCaptcha(newChallenge());
    setCaptchaVal("");
  }, []);

  useEffect(() => {
    refreshCaptcha();
    setFormState("idle");
    setFieldErrors({});
  }, [listingInfo, refreshCaptcha]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const errors = validateContactFields({ name, phone, email });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    if (parseInt(captchaVal, 10) !== captcha.answer) {
      setFormState("captcha-fail");
      refreshCaptcha();
      return;
    }

    setFormState("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          source,
          listingInfo,
        }),
      });
      if (!res.ok) throw new Error();
      setFormState("done");
      onDone?.();
    } catch {
      setFormState("error");
    }
  }

  if (formState === "done") {
    return (
      <div className="relative text-center py-3">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-0 text-white/45 hover:text-white transition-colors font-mono text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        ) : null}
        <p className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase mb-1">
          Sent
        </p>
        <p className="text-white/70 text-xs">I&apos;ll be in touch soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          {title}
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-white/45 hover:text-white transition-colors font-mono text-lg leading-none -mt-0.5"
            aria-label="Close"
          >
            ×
          </button>
        ) : null}
      </div>

      {listingInfo ? (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
            Listing
          </label>
          <input
            readOnly
            value={listingInfo}
            tabIndex={-1}
            aria-readonly="true"
            className={`${inputClass} text-white/85 cursor-default focus:border-white/10`}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
          First Last
        </label>
        <input
          required
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="Jane Smith"
          pattern={FULL_NAME_PATTERN.source}
          title="Enter first and last name (e.g. Jane Smith)"
          className={`${inputClass} ${fieldErrorClass(Boolean(fieldErrors.name))}`}
        />
        {fieldErrors.name ? (
          <p className="text-coral text-[10px] mt-0.5">{fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
          Ph #
        </label>
        <input
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => {
            setPhone(formatUsPhoneInput(e.target.value));
            if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
          }}
          placeholder="###-###-####"
          pattern={US_PHONE_PATTERN.source}
          title="Enter phone as ###-###-####"
          maxLength={12}
          className={`${inputClass} ${fieldErrorClass(Boolean(fieldErrors.phone))}`}
        />
        {fieldErrors.phone ? (
          <p className="text-coral text-[10px] mt-0.5">{fieldErrors.phone}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
          Email
        </label>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          placeholder="you@example.com"
          title="Enter a valid email address"
          className={`${inputClass} ${fieldErrorClass(Boolean(fieldErrors.email))}`}
        />
        {fieldErrors.email ? (
          <p className="text-coral text-[10px] mt-0.5">{fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
          Quick check — what is {captcha.a} {captcha.op} {captcha.b}?
        </label>
        <input
          required
          type="number"
          inputMode="numeric"
          value={captchaVal}
          onChange={(e) => {
            setCaptchaVal(e.target.value);
            if (formState === "captcha-fail") setFormState("idle");
          }}
          placeholder="Answer"
          className={`${inputClass} ${
            formState === "captcha-fail"
              ? "border-coral/60 focus:border-coral"
              : ""
          }`}
        />
        {formState === "captcha-fail" && (
          <p className="text-coral text-[10px] mt-0.5">
            Wrong answer — try the new question.
          </p>
        )}
      </div>

      {formState === "error" && (
        <p className="text-coral text-[10px]">Something went wrong — try again.</p>
      )}

      <button
        type="submit"
        disabled={formState === "submitting"}
        className="rounded-full bg-gold text-navy text-xs font-medium py-2 hover:bg-gold-light transition-colors disabled:opacity-60"
      >
        {formState === "submitting" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
