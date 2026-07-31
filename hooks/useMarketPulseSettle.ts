"use client";

import { useEffect, useRef, useState } from "react";
import {
  MARKET_PULSE_SETTLE_IDLE,
  SETTLE_COUNTUP_MS,
  SETTLE_SCRAMBLE_MS,
  SETTLE_SCRAMBLE_STEP_MS,
  prefersReducedMotion,
  type MarketPulseSettleState,
} from "@/lib/market-pulse-settle";

/**
 * One shared settle clock for Market Pulse KPIs + charts.
 * When `enabled` is false, stays on final values (no animation).
 */
export function useMarketPulseSettle(
  enabled: boolean,
  resetKey: string,
  onComplete?: () => void,
): MarketPulseSettleState {
  const [settle, setSettle] = useState<MarketPulseSettleState>(
    MARKET_PULSE_SETTLE_IDLE,
  );
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    let raf = 0;

    if (!enabled || prefersReducedMotion()) {
      setSettle(MARKET_PULSE_SETTLE_IDLE);
      if (enabled && prefersReducedMotion() && completedKey.current !== resetKey) {
        completedKey.current = resetKey;
        onCompleteRef.current?.();
      }
      return;
    }

    completedKey.current = null;
    setSettle({ phase: "scramble", tick: 0, countT: 0 });

    const scrambleSteps = Math.max(
      1,
      Math.floor(SETTLE_SCRAMBLE_MS / SETTLE_SCRAMBLE_STEP_MS),
    );
    for (let step = 1; step < scrambleSteps; step++) {
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setSettle({ phase: "scramble", tick: step, countT: 0 });
        }, step * SETTLE_SCRAMBLE_STEP_MS),
      );
    }

    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        const started = performance.now();
        setSettle({ phase: "countup", tick: scrambleSteps, countT: 0 });

        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - started) / SETTLE_COUNTUP_MS);
          setSettle({ phase: "countup", tick: scrambleSteps, countT: t });
          if (t < 1) {
            raf = requestAnimationFrame(tick);
            return;
          }
          setSettle(MARKET_PULSE_SETTLE_IDLE);
          if (completedKey.current !== resetKey) {
            completedKey.current = resetKey;
            onCompleteRef.current?.();
          }
        };
        raf = requestAnimationFrame(tick);
      }, SETTLE_SCRAMBLE_MS),
    );

    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, resetKey]);

  return settle;
}
