export class MealRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAt?: number,
    public readonly automaticRetryExhausted = false,
  ) {
    super(message);
    this.name = "MealRequestError";
  }
}

/** HTTP Retry-After accepts seconds or an absolute HTTP date. */
export function mealRetryAt(value: string | null, now = Date.now()): number {
  if (value?.trim()) {
    const trimmed = value.trim();
    const deadline = /^\d+(?:\.\d+)?$/.test(trimmed)
      ? now + Number(trimmed) * 1000
      : /^[A-Za-z]{3,9}[, ]/.test(trimmed) ? Date.parse(trimmed) : Number.NaN;
    if (Number.isSafeInteger(Math.ceil(deadline)) && deadline >= 0)
      return Math.max(now, Math.ceil(deadline));
  }
  return now + 30_000;
}

export function formatMealRetryTime(until: number): string {
  return new Date(until).toLocaleString();
}

export async function mealRequestFailure(response: Response): Promise<MealRequestError> {
  const retryAt = response.status === 429
    ? mealRetryAt(response.headers.get("Retry-After"))
    : undefined;
  return new MealRequestError(await mealRequestError(response), response.status, retryAt);
}

/** Show only the API's intentionally public message; never render raw error objects. */
export async function mealRequestError(response: Response): Promise<string> {
  const fallback = response.status === 429
    ? "The kitchen is busy. Wait a minute before trying again."
    : "We couldn’t finish that request. Your changes are still here; please try again.";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body &&
        typeof body.error === "string" && body.error.trim().length > 0 && body.error.length <= 500) {
      return body.error;
    }
  } catch {
    // Firewalls can return HTML or an empty response.
  }
  return fallback;
}

export function mealFailureMessage(reason: unknown): string {
  if (reason instanceof MealRequestError) {
    return reason.automaticRetryExhausted
      ? `${reason.message} The automatic retry stopped.`
      : reason.message;
  }
  if (reason instanceof Error && reason.name === "TimeoutError") {
    return "This is taking too long. Your input is still here; please try again.";
  }
  return reason instanceof Error && reason.name === "Error"
    ? reason.message
    : "We couldn’t finish that request. Your input is still here; please try again.";
}
