export class RequestBodyError extends Error {
  readonly status: number;
  constructor(public readonly code: "invalid_request" | "request_too_large") {
    super(code === "request_too_large" ? "This recipe request is too large. Reduce the recipe context and try again." : "Send valid kitchen details and a recipe request.");
    this.name = "RequestBodyError";
    this.status = code === "request_too_large" ? 413 : 400;
  }
}

/** One deadline covers body reading, tools, provider work, and response validation. */
export async function withRequestDeadline<T>(
  requestSignal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 45_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = () => controller.abort(new DOMException("Request deadline exceeded", "TimeoutError"));
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(timeout, timeoutMs);
  const signal = AbortSignal.any([requestSignal, controller.signal]);
  let onAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const result = await Promise.race([Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work(signal);
    }), aborted]);
    if (Date.now() >= deadline) timeout();
    signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/** Stop reading immediately on byte overflow or cancellation, including streamed bodies. */
export async function readJsonBody(
  request: Request,
  { signal, maxBytes }: { signal: AbortSignal; maxBytes: number },
): Promise<unknown> {
  signal.throwIfAborted();
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("invalid_request");
  const cancel = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("request_too_large");
      }
      chunks.push(next.value);
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      signal.throwIfAborted();
      return value;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof SyntaxError) throw new RequestBodyError("invalid_request");
      throw error;
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
