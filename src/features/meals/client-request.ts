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
  if (reason instanceof Error && reason.name === "TimeoutError") {
    return "This is taking too long. Your input is still here; please try again.";
  }
  return reason instanceof Error && reason.name === "Error"
    ? reason.message
    : "We couldn’t finish that request. Your input is still here; please try again.";
}
