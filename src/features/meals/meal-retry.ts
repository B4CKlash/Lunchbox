import { MealRequestError } from "./client-request";

export type MealRequestWait = { until: number; retrying: boolean };

function waitForMealRequest(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, Math.min(delay, 2_147_483_647));
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Share the server's cooldown across entry points; retry a busy request only once. */
export async function withMealRateLimitRecovery<T>(
  work: () => Promise<T>,
  {
    signal,
    getCooldownUntil,
    deferRequests,
    onWaiting,
    now = Date.now,
    wait = waitForMealRequest,
  }: {
    signal: AbortSignal;
    getCooldownUntil: () => number;
    deferRequests: (until: number) => void;
    onWaiting?: (waiting: MealRequestWait | null) => void;
    now?: () => number;
    wait?: (delay: number, signal: AbortSignal) => Promise<void>;
  },
): Promise<T> {
  let retrying = false;
  let localCooldownUntil = 0;
  while (true) {
    signal.throwIfAborted();
    let until = Math.max(localCooldownUntil, getCooldownUntil());
    while (until > now()) {
      onWaiting?.({ until, retrying });
      await wait(until - now(), signal);
      signal.throwIfAborted();
      // Another entry point may have extended the shared wait in the meantime.
      until = Math.max(localCooldownUntil, getCooldownUntil());
    }
    onWaiting?.(null);
    signal.throwIfAborted();
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof MealRequestError) || error.status !== 429) throw error;
      localCooldownUntil = Math.max(error.retryAt ?? now() + 30_000, getCooldownUntil());
      deferRequests(localCooldownUntil);
      if (retrying)
        throw new MealRequestError(error.message, error.status, localCooldownUntil, true);
      retrying = true;
    }
  }
}
