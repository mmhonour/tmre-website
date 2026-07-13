"use client";

import { useCallback, useEffect, useState } from "react";

type RetsCredentialsSource = "database" | "environment" | "mixed";

type RetsCredentials = {
  serverUrl: string;
  username: string;
  password: string;
  source: RetsCredentialsSource;
  updatedAt: string | null;
};

type RetsHealth = {
  configured: boolean;
  status: string;
  ok: boolean;
  message: string;
  checkedAt: string | null;
  detail?: string;
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sourceLabel(source: RetsCredentialsSource): string {
  if (source === "database") return "Saved in database";
  if (source === "environment") return "From environment";
  return "Mixed sources";
}

function sourceBadgeClass(source: RetsCredentialsSource): string {
  if (source === "database") return "bg-sage/15 text-sage border-sage/25";
  if (source === "environment") return "bg-gold/15 text-gold border-gold/25";
  return "bg-coral/10 text-coral border-coral/20";
}

function healthBadgeClass(health: RetsHealth | null): string {
  if (!health) return "bg-charcoal/5 text-charcoal/50 border-charcoal/10";
  if (health.ok) return "bg-sage/15 text-sage border-sage/25";
  if (health.status === "missing") return "bg-gold/15 text-gold border-gold/25";
  return "bg-coral/10 text-coral border-coral/20";
}

export default function AdminRetsCredentialsPanel() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [source, setSource] = useState<RetsCredentialsSource>("environment");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [health, setHealth] = useState<RetsHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback(
    (credentials: RetsCredentials, nextHealth: RetsHealth | null) => {
      setServerUrl(credentials.serverUrl);
      setUsername(credentials.username);
      setPassword(credentials.password);
      setSource(credentials.source);
      setUpdatedAt(credentials.updatedAt);
      if (nextHealth) setHealth(nextHealth);
    },
    [],
  );

  const loadCredentials = useCallback(async (probe = false) => {
    const url = probe
      ? "/api/admin/rets-credentials?probe=1"
      : "/api/admin/rets-credentials";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load RETS credentials");
    }
    const body = (await res.json()) as {
      credentials: RetsCredentials;
      health: RetsHealth | null;
    };
    applyPayload(body.credentials, body.health);
  }, [applyPayload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadCredentials(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load RETS credentials");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCredentials]);

  const saveCredentials = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/rets-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, username, password }),
      });
      const body = (await res.json()) as {
        credentials?: RetsCredentials;
        health?: RetsHealth;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError(body.detail ?? body.error ?? "Failed to save RETS credentials");
        return;
      }
      if (body.credentials) {
        applyPayload(body.credentials, body.health ?? null);
      }
      setMessage("RETS credentials saved to Postgres");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save RETS credentials");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      await loadCredentials(true);
      setMessage("RETS connection test complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "RETS connection test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            RETS credentials
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase ${sourceBadgeClass(source)}`}
          >
            {sourceLabel(source)}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate leading-relaxed max-w-2xl">
          SmartMLS RETS login used for MLS sync. Saved credentials persist in Postgres
          (sync_meta); Netlify environment variables remain the fallback on cold starts.
        </p>
        {updatedAt ? (
          <p className="mt-1 font-mono text-[10px] text-charcoal/50">
            Last saved {formatTimestamp(updatedAt)}
          </p>
        ) : null}
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-3">
        {loading ? (
          <p className="font-mono text-xs text-charcoal/50">Loading credentials…</p>
        ) : (
          <>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="Server URL"
              aria-label="Server URL"
              className="w-full rounded-lg border border-charcoal/[0.12] bg-white px-3 py-2 font-mono text-sm text-navy placeholder:text-charcoal/30 focus:outline-none focus:ring-2 focus:ring-gold/30"
              autoComplete="off"
              spellCheck={false}
            />

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              aria-label="Username"
              className="w-full rounded-lg border border-charcoal/[0.12] bg-white px-3 py-2 font-mono text-sm text-navy placeholder:text-charcoal/30 focus:outline-none focus:ring-2 focus:ring-gold/30"
              autoComplete="off"
              spellCheck={false}
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              className="w-full rounded-lg border border-charcoal/[0.12] bg-white px-3 py-2 font-mono text-sm text-navy placeholder:text-charcoal/30 focus:outline-none focus:ring-2 focus:ring-gold/30"
              autoComplete="off"
              spellCheck={false}
            />
          </>
        )}

        {health ? (
          <div
            className={`rounded-lg border px-3 py-2.5 ${healthBadgeClass(health)}`}
          >
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase">
              RETS health · {health.status}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{health.message}</p>
            {health.detail ? (
              <p className="mt-1 font-mono text-[10px] opacity-80 break-all">{health.detail}</p>
            ) : null}
            {health.checkedAt ? (
              <p className="mt-1 font-mono text-[10px] opacity-70">
                Checked {formatTimestamp(health.checkedAt)}
              </p>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <p className="font-mono text-xs text-sage">{message}</p>
        ) : null}
        {error ? (
          <p className="font-mono text-xs text-coral">{error}</p>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => void saveCredentials()}
            disabled={loading || saving || testing}
            className="rounded-lg bg-navy px-4 py-2 font-mono text-[11px] tracking-[0.08em] uppercase text-white transition hover:bg-navy/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save credentials"}
          </button>
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={loading || saving || testing}
            className="rounded-lg border border-charcoal/[0.15] bg-white px-4 py-2 font-mono text-[11px] tracking-[0.08em] uppercase text-navy transition hover:bg-cream/60 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
      </div>
    </div>
  );
}
