"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cookieLocationFromCatalog,
  cookiePurpose,
  deleteDocumentCookie,
  formatCookieLocation,
  parseDocumentCookies,
  previewCookieValue,
  readCookieStoreEntries,
  type CookieLocationInfo,
} from "@/lib/browser-cookies-catalog";
import { useSiteUnlockActions } from "@/components/SiteUnlockProvider";

type ServerCookieRow = {
  name: string;
  purpose: string;
  httpOnly: boolean;
  value: string | null;
  preview: string;
  present: boolean;
  location?: CookieLocationInfo;
};

type MergedRow = {
  name: string;
  purpose: string;
  /** Full value when available; null when redacted / absent. */
  value: string | null;
  preview: string;
  httpOnly: boolean;
  sources: Array<"document" | "server" | "cookieStore">;
  present: boolean;
  location: CookieLocationInfo;
};

/**
 * Admin → Cookies.
 * See location + contents for this browser only (prefs + HttpOnly session/visitor).
 */
export default function AdminBrowserCookiesPanel() {
  const router = useRouter();
  const { setUnlocked } = useSiteUnlockActions();
  const [serverRows, setServerRows] = useState<ServerCookieRow[]>([]);
  const [storeRows, setStoreRows] = useState<
    Awaited<ReturnType<typeof readCookieStoreEntries>>
  >([]);
  const [docTick, setDocTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, store] = await Promise.all([
        fetch("/api/admin/browser-cookies", { credentials: "same-origin" }),
        readCookieStoreEntries(),
      ]);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        cookies?: ServerCookieRow[];
        note?: string;
      };
      setServerRows(Array.isArray(data.cookies) ? data.cookies : []);
      setStoreRows(store);
      setNote(data.note ?? null);
      setDocTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cookies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo((): MergedRow[] => {
    void docTick;
    const doc = parseDocumentCookies(
      typeof document !== "undefined" ? document.cookie : "",
    );
    const byName = new Map<string, MergedRow>();

    for (const c of doc) {
      byName.set(c.name, {
        name: c.name,
        purpose: cookiePurpose(c.name),
        value: c.value,
        preview: previewCookieValue(c.value),
        httpOnly: false,
        sources: ["document"],
        present: true,
        location: cookieLocationFromCatalog(c.name),
      });
    }

    for (const s of storeRows) {
      const existing = byName.get(s.name);
      if (existing) {
        existing.location = s.location;
        existing.value = s.value;
        existing.preview = previewCookieValue(s.value);
        if (!existing.sources.includes("cookieStore")) {
          existing.sources.push("cookieStore");
        }
      } else {
        byName.set(s.name, {
          name: s.name,
          purpose: cookiePurpose(s.name),
          value: s.value,
          preview: previewCookieValue(s.value),
          httpOnly: false,
          sources: ["cookieStore"],
          present: true,
          location: s.location,
        });
      }
    }

    for (const s of serverRows) {
      const existing = byName.get(s.name);
      const serverLoc = s.location ?? cookieLocationFromCatalog(s.name);
      if (existing) {
        existing.httpOnly = existing.httpOnly || s.httpOnly;
        if (!existing.sources.includes("server")) {
          existing.sources.push("server");
        }
        if (s.httpOnly) {
          existing.value = s.value;
          existing.preview = s.preview;
          existing.purpose = s.purpose;
          existing.location = {
            ...serverLoc,
            // Keep Cookie Store path/domain when we already observed them.
            path: existing.location.observed
              ? existing.location.path
              : serverLoc.path,
            domain: existing.location.domain ?? serverLoc.domain,
            observed: existing.location.observed,
          };
        } else if (existing.value == null && s.value != null) {
          existing.value = s.value;
          existing.preview = s.preview;
        }
        existing.present = existing.present || s.present;
      } else {
        byName.set(s.name, {
          name: s.name,
          purpose: s.purpose,
          value: s.value,
          preview: s.preview,
          httpOnly: s.httpOnly,
          sources: ["server"],
          present: s.present,
          location: serverLoc,
        });
      }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [serverRows, storeRows, docTick]);

  async function deleteNames(names: string[], confirmAll = false) {
    if (names.length === 0) return;
    if (confirmAll) {
      const ok = window.confirm(
        "Clear all site cookies for this browser? This will log you out of Admin.",
      );
      if (!ok) return;
    } else if (names.includes("tmre_site_pass")) {
      const ok = window.confirm(
        "Delete the unlock cookie? You will be logged out of Admin.",
      );
      if (!ok) return;
    }

    setBusy(names.length === 1 ? names[0]! : "all");
    setError(null);
    try {
      for (const name of names) {
        deleteDocumentCookie(name);
      }

      const res = await fetch("/api/admin/browser-cookies", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmAll ? { all: true } : { names }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        loggedOut?: boolean;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      if (data?.loggedOut || names.includes("tmre_site_pass")) {
        setUnlocked(false);
        router.refresh();
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cookies");
      setBusy(null);
      await refresh();
      return;
    }
    setBusy(null);
  }

  async function copyValue(name: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      window.setTimeout(() => setCopied((cur) => (cur === name ? null : cur)), 1500);
    } catch {
      setError("Clipboard unavailable");
    }
  }

  const presentCount = rows.filter((r) => r.present).length;

  return (
    <div
      id="admin-browser-cookies"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/20 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Browser cookies
        </p>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          Cookies for <span className="font-medium text-navy">this browser
          only</span> — filter prefs, visitor id, and your Admin unlock. Location
          shows Path / host / SameSite; turn on{" "}
          <span className="font-medium text-navy">Show values</span> for full
          contents (unlock cookie stays redacted).
        </p>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || busy != null}
            className="rounded-lg border border-charcoal/15 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() =>
              void deleteNames(
                rows.filter((r) => r.present).map((r) => r.name),
                true,
              )
            }
            disabled={loading || busy != null || presentCount === 0}
            className="rounded-lg border border-coral/30 bg-coral/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
          >
            Clear all
          </button>
          <label className="ml-auto inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/55">
            <input
              type="checkbox"
              checked={showValues}
              onChange={(e) => setShowValues(e.target.checked)}
              className="rounded border-charcoal/25"
            />
            Show values
          </label>
        </div>

        {error ? (
          <p className="font-mono text-[11px] text-coral">{error}</p>
        ) : null}
        {note ? (
          <p className="text-xs leading-snug text-charcoal/50">{note}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-charcoal/[0.1]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-cream/40 font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Purpose</th>
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 font-medium">Value</th>
                <th className="px-3 py-2.5 font-medium">Flags</th>
                <th className="px-3 py-2.5 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/[0.08]">
              {rows.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-slate"
                  >
                    No cookies found for this browser.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const locLabel = formatCookieLocation(row.location);
                const isExpanded = expanded === row.name;
                const displayValue = !row.present
                  ? "(not set)"
                  : showValues
                    ? row.value ?? row.preview
                    : "••••";
                const canExpand =
                  showValues &&
                  row.present &&
                  row.value != null &&
                  row.value.length > 48;
                const canCopy =
                  showValues && row.present && row.value != null && row.value !== "";

                return (
                  <tr
                    key={row.name}
                    className={row.present ? "bg-white" : "bg-charcoal/[0.02]"}
                  >
                    <td className="px-3 py-2.5 align-top">
                      <span className="font-mono text-[11px] text-navy">
                        {row.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-slate">
                      {row.purpose}
                    </td>
                    <td className="max-w-[16rem] px-3 py-2.5 align-top">
                      <p className="break-words font-mono text-[10px] text-charcoal/70 leading-snug">
                        {locLabel}
                      </p>
                      {row.location.setBy ? (
                        <p className="mt-1 break-words font-mono text-[9px] text-charcoal/40 leading-snug">
                          {row.location.setBy}
                          {row.location.observed ? " · observed" : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-[18rem] px-3 py-2.5 align-top">
                      <span
                        className={`break-all font-mono text-[10px] text-charcoal/70 ${
                          isExpanded ? "whitespace-pre-wrap" : ""
                        }`}
                      >
                        {isExpanded && row.value != null
                          ? row.value
                          : canExpand && !isExpanded
                            ? previewCookieValue(displayValue, 48)
                            : displayValue}
                      </span>
                      {canExpand || canCopy ? (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {canExpand ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((cur) =>
                                  cur === row.name ? null : row.name,
                                )
                              }
                              className="font-mono text-[9px] tracking-[0.1em] uppercase text-navy/70 underline decoration-navy/25 underline-offset-2 hover:text-navy"
                            >
                              {isExpanded ? "Collapse" : "Expand"}
                            </button>
                          ) : null}
                          {canCopy ? (
                            <button
                              type="button"
                              onClick={() => void copyValue(row.name, row.value!)}
                              className="font-mono text-[9px] tracking-[0.1em] uppercase text-navy/70 underline decoration-navy/25 underline-offset-2 hover:text-navy"
                            >
                              {copied === row.name ? "Copied" : "Copy"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {row.httpOnly ? (
                          <span className="rounded border border-charcoal/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-charcoal/55">
                            HttpOnly
                          </span>
                        ) : null}
                        {row.sources.includes("document") ||
                        row.sources.includes("cookieStore") ? (
                          <span className="rounded border border-charcoal/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-charcoal/55">
                            JS
                          </span>
                        ) : null}
                        {row.sources.includes("server") ? (
                          <span className="rounded border border-charcoal/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-charcoal/55">
                            Server
                          </span>
                        ) : null}
                        {!row.present ? (
                          <span className="rounded border border-charcoal/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-charcoal/40">
                            Absent
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <button
                        type="button"
                        disabled={!row.present || busy != null}
                        onClick={() => void deleteNames([row.name])}
                        className="font-mono text-[10px] tracking-[0.12em] uppercase text-coral/80 underline decoration-coral/30 underline-offset-2 transition-colors hover:text-coral disabled:opacity-40 disabled:no-underline"
                      >
                        {busy === row.name ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs leading-snug text-charcoal/45">
          Clearing <span className="font-mono">tmre_site_pass</span> ends your
          Admin session. Clearing{" "}
          <span className="font-mono">tmre_vid</span> mints a new visitor id on
          the next page view. Does not affect other browsers or users. Cookie
          Store path/domain is used when the browser exposes it (Chromium);
          otherwise catalog defaults apply.
        </p>
      </div>
    </div>
  );
}
