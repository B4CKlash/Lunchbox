import "server-only";
import { importRecipeRequestSchema, importRecipeResponseSchema } from "@/lib/contracts";
import { publicAiError } from "./ai-runtime";
import { importRecipe } from "./import-provider";
import { ImportSourceError } from "./safe-url-fetch";
import { readJsonBody, RequestBodyError, withRequestDeadline } from "./request-boundary";

const headers = { "Cache-Control": "no-store" };

export function createImportHandler(provider: typeof importRecipe = importRecipe) {
  return async function handle(request: Request) {
    try {
      return await withRequestDeadline(request.signal, async (signal) => {
        const body = await readJsonBody(request, { signal, maxBytes: 1_000_000 });
        const parsed = importRecipeRequestSchema.safeParse(body);
        if (!parsed.success)
          return Response.json({ code: "invalid_request", error: "Use a recipe link or up to 20,000 characters of recipe text." }, { status: 400, headers });
        const result = importRecipeResponseSchema.parse(await provider(parsed.data, { signal }));
        return Response.json(result, { headers });
      });
    } catch (reason) {
      if (reason instanceof RequestBodyError)
        return Response.json({ code: reason.code, error: reason.code === "request_too_large"
          ? "This recipe request is too large. Paste a shorter recipe." : "Send recipe text or a valid recipe link." }, { status: reason.status, headers });
      if (reason instanceof ImportSourceError)
        return Response.json({ code: reason.code, error: reason.message }, { status: reason.status, headers });
      const { status, code, error, retryAfterSeconds } = publicAiError(reason);
      return Response.json({ code, error }, { status, headers: { ...headers, ...(code === "rate_limit" ? { "Retry-After": String(retryAfterSeconds ?? 30) } : {}) } });
    }
  };
}
