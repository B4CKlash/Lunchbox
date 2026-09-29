"use client";

import { useEffect, useState } from "react";

/** Re-enable controls at the persisted deadline without polling or shortening it. */
export function useMealCooldown(until: number): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, until - Date.now()), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [until, now]);
  return until > now;
}
