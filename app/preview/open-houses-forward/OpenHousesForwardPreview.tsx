"use client";

import { useMemo, useState } from "react";
import {
  formatOpenHouseHistory,
  formatOpenHouseWeekCount,
  OPEN_HOUSES_LOAD_ERROR_BODY,
  OPEN_HOUSES_LOAD_ERROR_TITLE,
  openHouseHorizonWindow,
  openHouseRemainingWeekLabel,
  openHouseRemainingWeekWindow,
  pickNextOpenHouse,
  type OpenHouseEvent,
} from "@/lib/open-houses";

type Scene = "loaded" | "empty" | "error";

function slot(id: string, date: string): OpenHouseEvent {
  return {
    id,
    listingKey: id,
    listingId: id,
    date,
    startDateTime: `${date}T11:00:00`,
    endDateTime: `${date}T13:00:00`,
    type: "Public",
    comment: null,
  };
}

const WEEKDAY_FIXTURES = [
  {
    weekday: "Sunday",
    at: "2026-09-13T04:00:00Z",
    page: "Sunday–Saturday",
  },
  {
    weekday: "Monday",
    at: "2026-09-14T04:00:00Z",
    page: "Monday–Sunday",
  },
  {
    weekday: "Thursday",
    at: "2026-09-10T16:00:00Z",
    page: "Thursday–Sunday",
  },
  {
    weekday: "Saturday",
    at: "2026-09-12T16:00:00Z",
    page: "Saturday–Sunday",
  },
] as const;

const TODAY = "2026-09-11";
const MON = slot("ended-mon", "2026-09-07");
const SAT = slot("live-sat", "2026-09-12");
const LIVE_EVENTS = [MON, SAT];
const ENDED_EVENTS = [MON];

export function OpenHousesForwardPreview() {
  const [scene, setScene] = useState<Scene>("loaded");
  const remaining = openHouseRemainingWeekWindow(
    new Date("2026-09-11T16:00:00Z"),
  );
  const liveNext = pickNextOpenHouse(LIVE_EVENTS, TODAY);
  const endedNext = pickNextOpenHouse(ENDED_EVENTS, TODAY);
  const remainingLive = useMemo(
    () => LIVE_EVENTS.filter((event) => event.date >= TODAY),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-charcoal/[0.08] font-mono text-[10px] uppercase tracking-[0.12em] text-slate">
              <th className="px-4 py-3 font-medium">When (ET)</th>
              <th className="px-4 py-3 font-medium">Page shows</th>
              <th className="px-4 py-3 font-medium">Dates</th>
              <th className="px-4 py-3 font-medium">Cache / RETS (t+6)</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_FIXTURES.map((row) => {
              const at = new Date(row.at);
              const page = openHouseRemainingWeekWindow(at);
              const inventory = openHouseHorizonWindow(at);
              return (
                <tr key={row.weekday} className="border-b border-charcoal/[0.06] last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{row.weekday}</td>
                  <td className="px-4 py-3 text-slate">{row.page}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate">
                    {page.start} → {page.end}
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.08em]">
                      {openHouseRemainingWeekLabel(page)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate">
                    {inventory.start} → {inventory.end}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["loaded", "Loaded week"],
            ["empty", "Empty week"],
            ["error", "Load failed"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scene === value}
            onClick={() => setScene(value)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
              scene === value
                ? "border-gold/50 bg-gold/10 text-navy"
                : "border-charcoal/[0.08] bg-white text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
        Friday remaining window {remaining.start} → {remaining.end}
      </p>

      {scene === "error" ? (
        <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-10 text-center">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
            {OPEN_HOUSES_LOAD_ERROR_TITLE}
          </p>
          <p className="text-charcoal/70">{OPEN_HOUSES_LOAD_ERROR_BODY}</p>
          <button
            type="button"
            onClick={() => setScene("loaded")}
            className="mt-5 rounded-full border border-charcoal/20 bg-white px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy"
          >
            Try again
          </button>
        </div>
      ) : scene === "empty" ? (
        <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-10 text-center">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
            No open houses found
          </p>
          <p className="text-charcoal/70">
            Nothing left this week in this town.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4">
            <p className="font-medium text-navy">16 Sea Spray Rd</p>
            <p className="mt-1 text-sm text-slate">
              Monday already happened; Saturday is still ahead. On the page:
              Saturday only. History stays as documentation.
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate">
              next {liveNext?.date ?? "none"} ·{" "}
              {formatOpenHouseWeekCount(remainingLive.length)} ·{" "}
              {formatOpenHouseHistory(1, remainingLive.length)}
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-charcoal/[0.12] bg-white/60 px-5 py-4">
            <p className="font-medium text-navy/60">2 Main St — not listed</p>
            <p className="mt-1 text-sm text-slate">
              Only Monday. The series ended T-1, so it is not a card. Past
              rows stay in the catalogue in case this home relists.
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate">
              next {endedNext?.date ?? "none"} · out of remaining week
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
