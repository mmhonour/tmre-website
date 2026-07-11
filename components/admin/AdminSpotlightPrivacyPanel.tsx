"use client";

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

type TabSaveStatus = "idle" | "saving" | "saved" | "error";

const DEFAULT_PRIVACY: SpotlightEffectivePrivacy = {
  showAddress: false,
  showClearPhotos: false,
  showPropertyMap: false,
};

export default function AdminSpotlightPrivacyPanel() {
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [overrides, setOverrides] = useState<SpotlightPrivacyOverrides>({});
  const [loading, setLoading] = useState(true);
  const [tabStatus, setTabStatus] = useState<
    Partial<Record<SpotlightPropertyTabId, TabSaveStatus>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const saveSeqRef = useRef(0);
  const savedTimersRef = useRef<
    Partial<Record<SpotlightPropertyTabId, ReturnType<typeof setTimeout>>>
  >({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/spotlight-privacy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { overrides: SpotlightPrivacyOverrides; tabs: TabRow[] }) => {
        setOverrides(data.overrides ?? {});
        setTabs(data.tabs ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Spotlight privacy
        </p>
        <p className="mt-1 text-sm text-charcoal/65 max-w-2xl">
          Tabs 1–3 default to town-only maps (no pin), blurred photos 1 &amp; 2,
          and hidden street addresses. Enable overrides per property when ready to
          go public. Changes save automatically.
        </p>
      </div>

      {loading ? (
        <p className="px-5 sm:px-6 py-6 font-mono text-xs text-charcoal/50">
          Loading spotlight settings…
        </p>
      ) : (
        <div className="divide-y divide-charcoal/[0.08]">
          {tabRows.map((row) => {
            const tabOverrides = overrides[row.tab] ?? {};
            const status = statusLabel(row.tab);
            return (
              <div key={row.tab} className="px-5 sm:px-6 py-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-navy">
                      Spotlight {row.tab}
                    </p>
                    <p className="mt-1 text-sm text-charcoal/70">
                      {row.street || row.label}
                      {row.town ? ` · ${row.town}` : ""}
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
                <div className="grid gap-3 sm:grid-cols-3">
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
