import {
  chatMealsRequestSchema,
  chatMealsResponseSchema,
  suggestMealsRequestSchema,
  suggestMealsResponseSchema,
  type ChatMealsRequest,
  type ChatMealsResponse,
  type SuggestMealsRequest,
  type SuggestMealsResponse,
} from "@/lib/contracts";
import { publicAiError } from "./ai-runtime";
import { chatAboutMeals, suggestMeals } from "./providers";
import { readJsonBody, RequestBodyError, withRequestDeadline } from "./request-boundary";

type RequestOptions = { signal?: AbortSignal };
type Providers = {
  suggest: (input: SuggestMealsRequest, options: RequestOptions) => Promise<SuggestMealsResponse>;
  chat: (input: ChatMealsRequest, options: RequestOptions) => Promise<ChatMealsResponse>;
};
const headers = { "Cache-Control": "no-store" };

/** Injectable API boundary keeps failure/cancellation verification entirely offline. */
export function createMealHandlers(
  providers: Providers = { suggest: suggestMeals, chat: chatAboutMeals },
  options: { timeoutMs?: number } = {},
) {
  async function handle(request: Request, kind: "chat" | "suggest") {
    try {
      return await withRequestDeadline(request.signal, async (signal) => {
        const body = await readJsonBody(request, { signal, maxBytes: kind === "chat" ? 1_000_000 : 100_000 });
        if (kind === "chat") {
          const parsed = chatMealsRequestSchema.safeParse(body);
          if (!parsed.success) return Response.json({ code: "invalid_request", error: "Check your message, pantry quantities, and meal preferences." }, { status: 400, headers });
          const result = chatMealsResponseSchema.parse(await providers.chat(parsed.data, { signal }));
          signal.throwIfAborted();
          return Response.json(result, { headers });
        }
        const parsed = suggestMealsRequestSchema.safeParse(body);
        if (!parsed.success) return Response.json({ code: "invalid_request", error: "Check your pantry quantities and meal preferences." }, { status: 400, headers });
        const result = suggestMealsResponseSchema.parse(await providers.suggest(parsed.data, { signal }));
        signal.throwIfAborted();
        return Response.json(result, { headers });
      }, options.timeoutMs);
    } catch (reason) {
      if (reason instanceof RequestBodyError)
        return Response.json({ error: reason.message, code: reason.code }, { status: reason.status, headers });
      const { status, error, code } = publicAiError(reason);
      return Response.json({ error, code }, { status, headers: { ...headers, ...(code === "rate_limit" ? { "Retry-After": "30" } : {}) } });
    }
  }
  return { chat: (request: Request) => handle(request, "chat"), suggest: (request: Request) => handle(request, "suggest") };
}
