"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatUsPhoneInput,
  FULL_NAME_PATTERN,
  US_PHONE_PATTERN,
  validateContactFields,
  type ContactFieldErrors,
} from "@/lib/contact-form-validation";

type FormState = "idle" | "submitting" | "done" | "error" | "captcha-fail";

type Challenge = { a: number; b: number; op: "+" | "−"; answer: number };

type AddressSuggestion = {
  propertyKey: string
  addressFull: string
  street: string
  town: string
  zip: string | null
  parcelNumber: string | null
  mlsId: string | null
  listingId: string | null
  price: number | null
  status: string | null
  source: string
}

type AddressSearchResponse = {
  addresses: AddressSuggestion[]
  error?: string
}

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

function fmtSuggestPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function formatMatchedListing(s: AddressSuggestion): string {
  if (s.mlsId) return `MLS ${s.mlsId} · ${s.addressFull || s.street}`
  if (s.parcelNumber) return `Parcel ${s.parcelNumber} · ${s.addressFull || s.street}`
  return s.addressFull || s.street
}

export default function ContactFormPanel({
  source,
  listingInfo = null,
  title = "Get in touch",
  showAddress = false,
  requireAddress = false,
  addressLabel = "Property address",
  addressPlaceholder = "Street, town, and any notes about the property…",
  submitLabel = "Send",
  onDone,
  onClose,
}: {
  source: string;
  listingInfo?: string | null;
  title?: string;
  showAddress?: boolean;
  requireAddress?: boolean;
  addressLabel?: string;
  addressPlaceholder?: string;
  submitLabel?: string;
  onDone?: () => void;
  onClose?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [matchedListingInfo, setMatchedListingInfo] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const addressRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    if (!showAddress) return;
    const q = address.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setHighlightIndex(-1);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const params = new URLSearchParams({ q, limit: "6" });
        const res = await fetch(`/api/addresses/search?${params}`, { signal: ac.signal });
        const data = (await res.json()) as AddressSearchResponse;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSuggestions(data.addresses ?? []);
        setSuggestOpen((data.addresses ?? []).length > 0);
        setHighlightIndex(-1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
        setSuggestOpen(false);
      } finally {
        if (!ac.signal.aborted) setSuggestLoading(false);
      }
    }, 300);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [address, showAddress]);

  const pickSuggestion = useCallback((s: AddressSuggestion) => {
    const line = s.addressFull || s.street;
    setAddress(line);
    setMatchedListingInfo(
      s.mlsId || s.parcelNumber || s.source === "assessor" || s.source === "both"
        ? formatMatchedListing(s)
        : null,
    );
    setSuggestions([]);
    setSuggestOpen(false);
    setHighlightIndex(-1);
    if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: undefined }));
  }, [fieldErrors.address]);

  const onAddressKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const errors = validateContactFields({
      name,
      phone,
      email,
      requireAddress: showAddress && requireAddress,
      address,
    });
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
          listingInfo: matchedListingInfo ?? listingInfo,
          address: showAddress ? address.trim() : null,
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

      {showAddress ? (
        <div className="relative flex flex-col gap-1">
          <label className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
            {addressLabel}
            {requireAddress ? "" : " (optional)"}
          </label>
          <textarea
            ref={addressRef}
            required={requireAddress}
            rows={4}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setMatchedListingInfo(null);
              if (fieldErrors.address)
                setFieldErrors((prev) => ({ ...prev, address: undefined }));
            }}
            onKeyDown={onAddressKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setSuggestOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setSuggestOpen(false), 150);
            }}
            role="combobox"
            aria-expanded={suggestOpen}
            aria-autocomplete="list"
            aria-controls="contact-address-suggestions"
            aria-activedescendant={
              highlightIndex >= 0 ? `contact-address-suggestion-${highlightIndex}` : undefined
            }
            placeholder={addressPlaceholder}
            maxLength={2000}
            autoComplete="off"
            className={`${inputClass} min-h-[5.5rem] resize-y ${fieldErrorClass(Boolean(fieldErrors.address))}`}
          />
          {(suggestOpen || suggestLoading) && address.trim().length >= 2 && (
            <ul
              id="contact-address-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-navy shadow-2xl shadow-black/40 py-1"
            >
              {suggestLoading && suggestions.length === 0 && (
                <li className="px-3 py-2 font-mono text-[10px] text-white/50">
                  Matching addresses…
                </li>
              )}
              {suggestions.map((s, i) => {
                const line = s.street || s.addressFull;
                const meta = [s.town, s.zip, s.status, s.source === "assessor" ? "assessor" : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={s.propertyKey} role="presentation">
                    <button
                      type="button"
                      id={`contact-address-suggestion-${i}`}
                      role="option"
                      aria-selected={highlightIndex === i}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                      onMouseEnter={() => setHighlightIndex(i)}
                      className={`w-full px-3 py-2 text-left transition-colors ${
                        highlightIndex === i ? "bg-gold/15" : "hover:bg-white/5"
                      }`}
                    >
                      <span className="block text-xs font-medium text-white">{line}</span>
                      <span className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px] text-white/45">
                        <span className="truncate">
                          {s.mlsId ? `MLS ${s.mlsId}` : s.parcelNumber ? `Parcel ${s.parcelNumber}` : "Property directory"}
                          {meta ? ` · ${meta}` : ""}
                        </span>
                        {s.price != null ? (
                          <span className="text-gold tabular-nums shrink-0">
                            {fmtSuggestPrice(s.price)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {matchedListingInfo ? (
            <p className="font-mono text-[9px] tracking-[0.1em] text-gold/80">
              Matched {matchedListingInfo}
            </p>
          ) : null}
          {fieldErrors.address ? (
            <p className="text-coral text-[10px] mt-0.5">{fieldErrors.address}</p>
          ) : null}
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
        {formState === "submitting" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
