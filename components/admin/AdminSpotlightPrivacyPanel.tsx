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
import { SPOTLIGHT_ADMIN_RULES } from "@/lib/spotlight-safety-shared";
import {
  DEFAULT_SPOTLIGHT_TAB_ORDER,
  normalizeSpotlightTabOrder,
} from "@/lib/spotlight-tab-order-shared";

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
  | "pulled"
  | "promoted"
  | "cleared"
  | "notfound"
  | "duplicate"
  | "persist"
  | "error";

type MlsPromotion = {
  previousMlsId: string;
  newMlsId: string;
  newerByTimestamp: boolean | null;
};

type IngestInfo = {
  alreadyInDb: boolean;
  persisted: boolean;
  cacheWarmed: boolean;
  source: "db" | "rets" | "none";
};

const DEFAULT_PRIVACY: SpotlightEffectivePrivacy = {
  showAddress: false,
  showClearPhotos: false,
  showPropertyMap: false,
  clearComingSoon: false,
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
  const [ingestByTab, setIngestByTab] = useState<
    Partial<Record<SpotlightPropertyTabId, IngestInfo>>
  >({});
  const [promotionByTab, setPromotionByTab] = useState<
    Partial<Record<SpotlightPropertyTabId, MlsPromotion>>
  >({});
  const [displayOrder, setDisplayOrder] = useState<SpotlightPropertyTabId[]>([
    ...DEFAULT_SPOTLIGHT_TAB_ORDER,
  ]);
  const [savedDisplayOrder, setSavedDisplayOrder] = useState<
    SpotlightPropertyTabId[]
  >([...DEFAULT_SPOTLIGHT_TAB_ORDER]);
  const [orderStatus, setOrderStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const orderSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      fetch("/api/admin/spotlight-tab-order", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
    ])
      .then(
        ([privacy, mlsData, orderData]: [
          { overrides: SpotlightPrivacyOverrides; tabs: TabRow[] },
          { tabs: TabMls[]; duplicateTabs?: SpotlightPropertyTabId[] },
          { order?: unknown },
        ]) => {
          setOverrides(privacy.overrides ?? {});
          setTabs(privacy.tabs ?? []);
          applyMlsSummaries(mlsData.tabs ?? []);
          setDuplicateTabs(mlsData.duplicateTabs ?? []);
          const order = normalizeSpotlightTabOrder(orderData.order);
          setDisplayOrder(order);
          setSavedDisplayOrder(order);
          setOrderStatus("idle");
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
      if (orderSavedTimerRef.current) clearTimeout(orderSavedTimerRef.current);
    };
  }, []);

  const orderDirty =
    displayOrder.join(",") !== savedDisplayOrder.join(",");

  function moveDisplaySlot(tab: SpotlightPropertyTabId, delta: -1 | 1) {
    setDisplayOrder((prev) => {
      const idx = prev.indexOf(tab);
      if (idx < 0) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      return next;
    });
    setOrderStatus("idle");
  }

  async function saveDisplayOrder() {
    if (!orderDirty) return;
    setOrderStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/spotlight-tab-order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: displayOrder }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { order?: unknown };
      const order = normalizeSpotlightTabOrder(data.order ?? displayOrder);
      setDisplayOrder(order);
      setSavedDisplayOrder(order);
      setOrderStatus("saved");
      if (orderSavedTimerRef.current) clearTimeout(orderSavedTimerRef.current);
      orderSavedTimerRef.current = setTimeout(() => {
        setOrderStatus("idle");
        orderSavedTimerRef.current = null;
      }, 5000);
    } catch (err) {
      setOrderStatus("error");
      setError(err instanceof Error ? err.message : "Order save failed");
    }
  }

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
        reason?: "duplicate" | "notfound" | "persist" | "db";
        conflictTab?: SpotlightPropertyTabId;
        tabs?: TabMls[];
        tab?: TabMls;
        duplicateTabs?: SpotlightPropertyTabId[];
        ingest?: IngestInfo | null;
        promotion?: MlsPromotion | null;
        error?: string;
      };

      if (!data.saved) {
        if (data.reason === "duplicate" && data.conflictTab != null) {
          setConflictTab((prev) => ({ ...prev, [tab]: data.conflictTab! }));
          setMlsStatus((prev) => ({ ...prev, [tab]: "duplicate" }));
          return;
        }
        if (data.reason === "persist" || data.reason === "db") {
          setMlsStatus((prev) => ({ ...prev, [tab]: "persist" }));
          setError(data.error ?? "Could not write listing to Postgres");
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
      if (data.ingest) {
        setIngestByTab((prev) => ({ ...prev, [tab]: data.ingest! }));
      }
      if (data.promotion) {
        setPromotionByTab((prev) => ({ ...prev, [tab]: data.promotion! }));
      } else {
        setPromotionByTab((prev) => {
          const next = { ...prev };
          delete next[tab];
          return next;
        });
      }
      const pulledFresh = Boolean(
        data.ingest && !data.ingest.alreadyInDb && data.ingest.persisted,
      );
      const promoted = Boolean(data.promotion);
      setMlsStatus((prev) => ({
        ...prev,
        [tab]:
          value.length === 0
            ? "cleared"
            : promoted
              ? "promoted"
              : pulledFresh
                ? "pulled"
                : "saved",
      }));

      const existingTimer = savedTimersRef.current[tab];
      if (existingTimer) clearTimeout(existingTimer);
      savedTimersRef.current[tab] = setTimeout(() => {
        setMlsStatus((prev) =>
          prev[tab] === "saved" ||
          prev[tab] === "pulled" ||
          prev[tab] === "promoted" ||
          prev[tab] === "cleared"
            ? { ...prev, [tab]: "idle" }
            : prev,
        );
        delete savedTimersRef.current[tab];
      }, 5000);
    } catch (err) {
      setMlsStatus((prev) => ({ ...prev, [tab]: "error" }));
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const tabRowsBase =
    tabs.length > 0
      ? tabs
      : SPOTLIGHT_PROPERTY_TABS.map((tab) => ({
          tab,
          label: `Property ${tab}`,
          town: "",
          street: "",
          effective: DEFAULT_PRIVACY,
        }));
  const tabById = new Map(tabRowsBase.map((row) => [row.tab, row]));
  const tabRows = displayOrder
    .map((tab) => tabById.get(tab))
    .filter((row): row is TabRow => row != null);

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
    if (status === "validating") {
      return {
        text: "Checking Postgres — if missing, pulling RETS and writing Postgres now…",
        tone: "muted",
      };
    }
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
    if (status === "persist")
      return {
        text: "RETS found it, but Postgres write failed — retry",
        tone: "bad",
      };
    if (status === "cleared") return { text: "Cleared — tab hidden", tone: "muted" };
    if (status === "promoted") {
      const promo = promotionByTab[tab];
      if (promo) {
        const ageNote =
          promo.newerByTimestamp === true
            ? " · newer MLS mod time"
            : promo.newerByTimestamp === false
              ? " · older MLS mod time than previous pin"
              : "";
        return {
          text: `Promoted #${promo.previousMlsId} → #${promo.newMlsId}${ageNote}`,
          tone: "ok",
        };
      }
      return { text: "Promoted new MLS # pin", tone: "ok" };
    }
    if (status === "pulled") {
      const ingest = ingestByTab[tab];
      return {
        text: ingest?.cacheWarmed
          ? "Pulled from RETS · saved to Postgres · Spotlight cache ready"
          : "Pulled from RETS · saved to Postgres",
        tone: "ok",
      };
    }
    if (status === "saved")
      return {
        text: summary?.town
          ? `Saved · already in Postgres · ${summary.town}`
          : "Saved · already in Postgres",
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
          Assign MLS #s, privacy, and rail order below. All operating rules for
          Spotlight are published in this panel — keep them current when
          behavior changes.
        </p>
        <div className="mt-4 rounded-xl border border-gold/35 bg-gold/10 px-4 py-4 max-w-3xl">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-navy">
            Spotlight rules
          </p>
          <p className="mt-1 text-xs text-charcoal/60">
            Source of truth for how Admin pins and the public /spotlight page
            behave. Slot numbers are stable; display order is separate.
          </p>
          <ol className="mt-3 list-none space-y-3">
            {SPOTLIGHT_ADMIN_RULES.map((rule, index) => (
              <li
                key={rule.id}
                className="rounded-lg border border-navy/10 bg-white/60 px-3 py-2.5"
              >
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-navy">
                  {index + 1}. {rule.title}
                </p>
                <p className="mt-1 text-sm font-medium text-navy/90">
                  {rule.summary}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-charcoal/70">
                  {rule.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {!loading ? (
        <div className="mx-5 sm:mx-6 mt-4 rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-xl">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-navy">
                Display order
              </p>
              <p className="mt-1 text-xs text-charcoal/65 leading-relaxed">
                Reorder how tabs appear on the public Spotlight rail. Slot
                numbers stay fixed (Property #5 stays #5 with the same MLS,
                privacy, and links). This does not swap MLS ids between slots.
              </p>
              <p className="mt-2 font-mono text-[11px] text-charcoal/80 tracking-wide">
                Rail:{" "}
                {displayOrder.map((tab, i) => (
                  <span key={tab}>
                    {i > 0 ? (
                      <span className="text-charcoal/35"> → </span>
                    ) : null}
                    <span className="text-navy">#{tab}</span>
                  </span>
                ))}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                disabled={!orderDirty || orderStatus === "saving"}
                onClick={() => void saveDisplayOrder()}
                className="rounded-lg bg-navy px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-cream disabled:opacity-40 hover:bg-navy/90"
              >
                {orderStatus === "saving" ? "Saving…" : "Save order"}
              </button>
              <p
                className={`font-mono text-[10px] tracking-[0.1em] ${
                  orderStatus === "error"
                    ? "text-coral"
                    : orderStatus === "saved"
                      ? "text-sage"
                      : orderDirty
                        ? "text-charcoal/45"
                        : "text-charcoal/35"
                }`}
              >
                {orderStatus === "saving"
                  ? "Saving…"
                  : orderStatus === "saved"
                    ? "Order saved · updating site…"
                    : orderStatus === "error"
                      ? "Save failed"
                      : orderDirty
                        ? "Unsaved order changes"
                        : "Order matches site"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

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
                      <span className="ml-2 text-charcoal/40 normal-case tracking-normal">
                        rail position{" "}
                        {displayOrder.indexOf(row.tab) + 1} of{" "}
                        {displayOrder.length}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-charcoal/70">
                      {headerLabel(row)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-charcoal/15 overflow-hidden">
                      <button
                        type="button"
                        className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/70 hover:bg-cream disabled:opacity-30"
                        disabled={displayOrder.indexOf(row.tab) <= 0}
                        onClick={() => moveDisplaySlot(row.tab, -1)}
                        aria-label={`Move Spotlight ${row.tab} earlier in the rail`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/70 hover:bg-cream border-l border-charcoal/15 disabled:opacity-30"
                        disabled={
                          displayOrder.indexOf(row.tab) >=
                          displayOrder.length - 1
                        }
                        onClick={() => moveDisplaySlot(row.tab, 1)}
                        aria-label={`Move Spotlight ${row.tab} later in the rail`}
                      >
                        ↓
                      </button>
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

                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                          Exact location with house marker (off = town outline with ?)
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-charcoal/[0.08] px-4 py-3 cursor-pointer hover:border-gold/30">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-gold"
                        checked={tabOverrides.clearComingSoon === true}
                        onChange={(e) =>
                          toggle(row.tab, "clearComingSoon", e.target.checked)
                        }
                      />
                      <span>
                        <span className="block text-sm text-charcoal font-medium">
                          No longer Coming Soon
                        </span>
                        <span className="block text-xs text-charcoal/55 mt-0.5">
                          Sticky — drop Coming Soon title/blur even if MLS lags
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

      <div className="px-5 sm:px-6 py-4 border-t border-charcoal/[0.08] bg-cream/30">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
          How Spotlight gets the listing
        </p>
        <p className="mt-2 text-sm text-charcoal/65 max-w-2xl leading-relaxed">
          The listing itself lives in Postgres{" "}
          <span className="text-charcoal/80">listings</span> — that is the
          inventory row the public page should serve. On save we pull from RETS
          (if needed) and upsert there. A small{" "}
          <span className="text-charcoal/80">stats_cache</span> hotspot is only
          a temporary shelf: when Neon is slow or an incremental sync is busy,
          we can still show the RETS payload immediately while the{" "}
          <span className="text-charcoal/80">listings</span> upsert catches up.
          You do not need cache for the listing to exist — you need the row in{" "}
          <span className="text-charcoal/80">listings</span>. Cache is backup
          speed, not the source of truth.
        </p>
      </div>
    </div>
  );
}
