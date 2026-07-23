"use client";

import { useEffect, useState } from "react";
import { readClientPref, writeClientPref } from "@/lib/client-prefs";
import {
  fetchVisitorLocation,
  matchVisitorTownToOptions,
} from "@/lib/visitor-location";

export function usePersistedFilter<T extends string>(
  key: string,
  defaultValue: T,
  validValues: readonly T[],
  preferVisitorTown = false,
  /** When no stored pref, call this (client-only) instead of `defaultValue`. */
  resolveDefault?: () => T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stored = readClientPref(key);
    if (stored && (validValues as readonly string[]).includes(stored)) {
      setValue(stored as T);
      setHydrated(true);
      return;
    }

    if (!preferVisitorTown) {
      setValue(resolveDefault ? resolveDefault() : defaultValue);
      setHydrated(true);
      return;
    }

    fetchVisitorLocation().then((loc) => {
      if (cancelled) return;
      const match = matchVisitorTownToOptions(loc.town, validValues);
      if (match) setValue(match);
      else if (resolveDefault) setValue(resolveDefault());
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
    // validValues / resolveDefault are stable module-level or call-site constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, preferVisitorTown, defaultValue]);

  useEffect(() => {
    if (hydrated) writeClientPref(key, value);
  }, [key, value, hydrated]);

  return [value, setValue];
}

export function usePersistedNullableFilter(
  key: string,
): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readClientPref(key);
    if (stored != null) setValue(stored === "" ? null : stored);
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (hydrated) writeClientPref(key, value ?? "");
  }, [key, value, hydrated]);

  return [value, setValue];
}
