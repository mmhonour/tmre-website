"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpotlightEffectivePrivacy,
  SpotlightPrivacyOverrides,
} from "@/lib/spotlight-privacy-shared";
import {
  SPOTLIGHT_PROPERTY_TABS,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";

type TabRow = {
  tab: SpotlightPropertyTabId;
  label: string;
  town: string;
  street: string;
  effective: SpotlightEffectivePrivacy;
};

type TabMls = {
  tab: SpotlightPropertyTabId;
  mlsId: string;
  exists: boolean;
  street: string;
  town: string;
  source: "db" | "rets" | "none" | "error";
}

/** Public spotlight URL for a given tab (tab 1 is the default route). */
function spotlightHref(tab: SpotlightPropertyTabId): string {
  return tab === 1 ? "/spotlight" : `/spotlight?property=${tab}`;
};

type TabSaveStatus = "idle" | "saving" | "saved" | "error";
type MlsSaveStatus =
  | "idle"
  | "validating"
  | "saved"
  | "cleared"
  | "notfound"
  | "duplicate"
  | "error";

const DEFAULT_PRIVACY: SpotlightEffectivePrivacy = {
  showAddress: false,
  showClearPhotos: false,
  showPropertyMap: false,
};

export default function AdminSpotlightPrivacyPanel() {
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [overrides, setOverrides] = useState<SpotlightPrivacyOverrides>({});
  const [mls, setMls] = useState<Partial<Record<SpotlightPropertyTabId, TabMls>>>({});
  const [mlsInput, setMlsInput] = useState<
    Partial<Record<SpotlightPropertyTabId, string>>
  >({});
  const [mlsStatus, setMlsStatus] = useState<
    Partial<Record<SpotlightPropertyTabId, MlsSaveStatus>>
  >({});
  const [loading, setLoading] = useState(true);
  const [tabStatus, setTabStatus] = useState<
    Partial<Record<SpotlightPropertyTabId, TabSaveStatus>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [duplicateTabs, setDuplicateTabs] = useState<SpotlightPropertyTabId[]>(
    [],
  );
  const [conflictTab, setConflictTab] = useState<
    Partial<Record<SpotlightPropertyTabId, SpotlightPropertyTabId>>
  >({});
  const saveSeqRef = useRef(0);
  const savedTimersRef = useRef<
    Partial<Record<SpotlightPropertyTabId, ReturnType<typeof setTimeout>>>
  >({});

  const applyMlsSummaries = useCallback((rows: TabMls[]) => {
    const byTab: Partial<Record<SpotlightPropertyTabId, TabMls>> = {};
    for (const row of rows) byTab[row.tab] = row;
    setMls(byTab);
    setMlsInput((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (next[row.tab] === undefined) next[row.tab] = row.mlsId;
      }
      return next;
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/admin/spotlight-privacy", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
      fetch("/api/admin/spotlight-mls", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
    ])
      .then(
        ([privacy, mlsData]: [
          { overrides: SpotlightPrivacyOverrides; tabs: TabRow[] },
          { tabs: TabMls[]; duplicateTabs?: SpotlightPropertyTabId[] },
        ]) => {
          setOverrides(privacy.overrides ?? {});
          setTabs(privacy.tabs ?? []);
          applyMlsSummaries(mlsData.tabs ?? []);
          setDuplicateTabs(mlsData.duplicateTabs ?? []);
        },
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [applyMlsSummaries]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(savedTimersRef.current)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, []);

  async function persistOverrides(
    nextOverrides: SpotlightPrivacyOverrides,
    tab: SpotlightPropertyTabId,
  ) {
    const seq = ++saveSeqRef.current;
    setTabStatus((prev) => ({ ...prev, [tab]: "saving" }));
    setError(null);

    try {
      const res = await fetch("/api/admin/spotlight-privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: nextOverrides }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        overrides: SpotlightPrivacyOverrides;
        tabs: TabRow[];
      };
      if (seq !== saveSeqRef.current) return;
      setOverrides(data.overrides ?? {});
      setTabs(data.tabs ?? []);
      setTabStatus((prev) => ({ ...prev, [tab]: "saved" }));

      const existingTimer = savedTimersRef.current[tab];
      if (existingTimer) clearTimeout(existingTimer);
      savedTimersRef.current[tab] = setTimeout(() => {
        setTabStatus((prev) =>
          prev[tab] === "saved" ? { ...prev, [tab]: "idle" } : prev,
        );
        delete savedTimersRef.current[tab];
      }, 2000);
    } catch (err) {
      if (seq !== saveSeqRef.current) return;
      setTabStatus((prev) => ({ ...prev, [tab]: "error" }));
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function toggle(
    tab: SpotlightPropertyTabId,
    key: keyof SpotlightEffectivePrivacy,
    checked: boolean,
  ) {
    setOverrides((prev) => {
      const next = {
        ...prev,
        [tab]: {
          ...prev[tab],
          [key]: checked,
        },
      };
      void persistOverrides(next, tab);
      return next;
    });
  }

  async function saveMlsId(tab: SpotlightPropertyTabId) {
    const value = (mlsInput[tab] ?? "").trim();
    // No-op when unchanged from the last saved/effective value.
    if (value === (mls[tab]?.mlsId ?? "")) return;

    setMlsStatus((prev) => ({ ...prev, [tab]: "validating" }));
    setConflictTab((prev) => {
      const next = { ...prev };
      delete next[tab];
      return next;
    });
    setError(null);
    try {
      const res = await fetch("/api/admin/spotlight-mls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, mlsId: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        ok: boolean;
        saved: boolean;
        reason?: "duplicate" | "notfound";
        conflictTab?: SpotlightPropertyTabId;
        tabs?: TabMls[];
        tab?: TabMls;
        duplicateTabs?: SpotlightPropertyTabId[];
      };

      if (!data.saved) {
        if (data.reason === "duplicate" && data.conflictTab != null) {
          setConflictTab((prev) => ({ ...prev, [tab]: data.conflictTab! }));
          setMlsStatus((prev) => ({ ...prev, [tab]: "duplicate" }));
          return;
        }
        setMlsStatus((prev) => ({ ...prev, [tab]: "notfound" }));
        return;
      }
      if (data.tabs) applyMlsSummaries(data.tabs);
      if (data.duplicateTabs) setDuplicateTabs(data.duplicateTabs);
      if (data.tab) {
        setMlsInput((prev) => ({ ...prev, [tab]: data.tab!.mlsId }));
      }
      setMlsStatus((prev) => ({
        ...prev,
        [tab]: value.length === 0 ? "cleared" : "saved",
      }));

      const existingTimer = savedTimersRef.current[tab];
      if (existingTimer) clearTimeout(existingTimer);
      savedTimersRef.current[tab] = setTimeout(() => {
        setMlsStatus((prev) =>
          prev[tab] === "saved" || prev[tab] === "cleared"
            ? { ...prev, [tab]: "idle" }
            : prev,
        );
        delete savedTimersRef.current[tab];
      }, 2500);
    } catch (err) {
      setMlsStatus((prev) => ({ ...prev, [tab]: "error" }));
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const tabRows =
    tabs.length > 0
      ? tabs
      : SPOTLIGHT_PROPERTY_TABS.map((tab) => ({
          tab,
          label: `Property ${tab}`,
          town: "",
          street: "",
          effective: DEFAULT_PRIVACY,
        }));

  function statusLabel(tab: SpotlightPropertyTabId): string | null {
    const status = tabStatus[tab] ?? "idle";
    if (status === "saving") return "Saving…";
    if (status === "saved") return "Saved";
    if (status === "error") return "Save failed";
    return null;
  }

  function headerLabel(row: TabRow): string {
    const summary = mls[row.tab];
    if (summary?.exists) {
      return [summary.street, summary.town].filter(Boolean).join(" · ");
    }
    if (summary?.source === "error") {
      return `MLS ${summary.mlsId} — database unreachable`;
    }
    if (summary && summary.mlsId && !summary.exists) {
      return `MLS ${summary.mlsId} — not found`;
    }
    if (!summary?.mlsId) return "Empty slot — hidden until assigned";
    return row.street || row.label;
  }

  function mlsHelper(tab: SpotlightPropertyTabId): {
    text: string;
    tone: "muted" | "ok" | "bad";
  } {
    const status = mlsStatus[tab] ?? "idle";
    const summary = mls[tab];
    if (status === "validating") return { text: "Checking Postgres, then RETS…", tone: "muted" };
    if (status === "duplicate") {
      const other = conflictTab[tab];
      return {
        text:
          other != null
            ? `Already used on Spotlight ${other} — pick a different MLS #`
            : "Already used on another Spotlight slot",
        tone: "bad",
      };
    }
    if (status === "notfound")
      return { text: "MLS # not found in Postgres or RETS", tone: "bad" };
    if (status === "cleared") return { text: "Cleared — tab hidden", tone: "muted" };
    if (status === "saved")
      return {
        text: summary?.town ? `Saved · ${summary.town}` : "Saved",
        tone: "ok",
      };
    if (status === "error") return { text: "Save failed", tone: "bad" };
    if (summary?.exists) {
      const src = summary.source === "rets" ? "RETS" : "Postgres";
      return { text: `${summary.town || "Found"} · via ${src}`, tone: "ok" };
    }
    if (summary?.source === "error")
      return {
        text: "Postgres unreachable — is the database running?",
        tone: "bad",
      };
    if (summary?.mlsId && !summary.exists)
      return { text: "Saved id no longer resolves", tone: "bad" };
    return { text: "Blank = hide this tab", tone: "muted" };
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Spotlight properties
        </p>
        <p className="mt-1 text-sm text-charcoal/65 max-w-2xl">
          Assign an MLS # to each slot (validated against Postgres, then RETS).
          Each listing can only appear once — duplicates are rejected. Blank
          slots are hidden on the public spotlight page. Privacy toggles default
          off (address hidden, photos 1 &amp; 2 blurred, town-only map). Changes
          save automatically.
        </p>
      </div>

      {duplicateTabs.length > 0 ? (
        <div className="mx-5 sm:mx-6 mt-4 rounded-xl border border-coral/30 bg-coral/5 px-4 py-3">
          <p className="text-sm text-coral font-medium">
            Duplicate MLS detected on Spotlight{" "}
            {duplicateTabs.join(", ")}. Clear or reassign those slots so each
            listing appears only once.
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="px-5 sm:px-6 py-6 font-mono text-xs text-charcoal/50">
          Loading spotlight settings…
        </p>
      ) : (
        <div className="divide-y divide-charcoal/[0.08]">
          {tabRows.map((row) => {
            const tabOverrides = overrides[row.tab] ?? {};
            const status = statusLabel(row.tab);
            const helper = mlsHelper(row.tab);
            return (
              <div key={row.tab} className="px-5 sm:px-6 py-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-navy">
                      Spotlight {row.tab}
                    </p>
                    <p className="mt-1 text-sm text-charcoal/70">
                      {headerLabel(row)}
                    </p>
                  </div>
                  {status ? (
                    <p
                      className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                        tabStatus[row.tab] === "error"
                          ? "text-coral"
                          : tabStatus[row.tab] === "saved"
                            ? "text-sage"
                            : "text-charcoal/45"
                      }`}
                    >
                      {status}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="lg:w-64 lg:shrink-0">
                    <label className="block rounded-xl border border-charcoal/[0.08] px-4 py-3">
                      <span className="block text-sm text-charcoal font-medium">
                        MLS #
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="mt-1.5 w-full rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 font-mono text-sm text-charcoal focus:border-gold focus:outline-none"
                        placeholder="e.g. 24180824"
                        value={mlsInput[row.tab] ?? ""}
                        onChange={(e) =>
                          setMlsInput((prev) => ({
                            ...prev,
                            [row.tab]: e.target.value,
                          }))
                        }
                        onBlur={() => void saveMlsId(row.tab)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                      <span
                        className={`mt-1 block text-xs ${
                          helper.tone === "bad"
                            ? "text-coral"
                            : helper.tone === "ok"
                              ? "text-sage"
                              : "text-charcoal/55"
                        }`}
                      >
                        {helper.text}
                      </span>
                    </label>
                  </div>

                  <div className="grid flex-1 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <label className="flex items-start gap-3 rounded-xl border border-charcoal/[0.08] px-4 py-3 cursor-pointer hover:border-gold/30">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-gold"
                          checked={tabOverrides.showAddress === true}
                          onChange={(e) =>
                            toggle(row.tab, "showAddress", e.target.checked)
                          }
                        />
                        <span>
                          <span className="block text-sm text-charcoal font-medium">
                            Show address
                          </span>
                          <span className="block text-xs text-charcoal/55 mt-0.5">
                            Street address on the spotlight header
                          </span>
                        </span>
                      </label>
                      <Link
                        href={spotlightHref(row.tab)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy/70 transition-colors hover:text-gold"
                      >
                        Preview page
                        <span aria-hidden>↗</span>
                        <span className="ml-1 normal-case tracking-normal text-charcoal/40">
                          {spotlightHref(row.tab)}
                        </span>
                      </Link>
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-charcoal/[0.08] px-4 py-3 cursor-pointer hover:border-gold/30">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-gold"
                        checked={tabOverrides.showClearPhotos === true}
                        onChange={(e) =>
                          toggle(row.tab, "showClearPhotos", e.target.checked)
                        }
                      />
                      <span>
                        <span className="block text-sm text-charcoal font-medium">
                          Clear photos 1 &amp; 2
                        </span>
                        <span className="block text-xs text-charcoal/55 mt-0.5">
                          Remove blur on the first two listing photos
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-charcoal/[0.08] px-4 py-3 cursor-pointer hover:border-gold/30">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-gold"
                        checked={tabOverrides.showPropertyMap === true}
                        onChange={(e) =>
                          toggle(row.tab, "showPropertyMap", e.target.checked)
                        }
                      />
                      <span>
                        <span className="block text-sm text-charcoal font-medium">
                          Property map &amp; pin
                        </span>
                        <span className="block text-xs text-charcoal/55 mt-0.5">
                          Exact location with house marker (off = town map only)
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="px-5 sm:px-6 py-3 border-t border-charcoal/[0.08] font-mono text-xs text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
