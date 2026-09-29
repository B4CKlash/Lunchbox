import { chatAboutMeals } from "@/features/meals/providers";
import {
  chatMealsRequestSchema,
  chatMealsResponseSchema,
} from "@/lib/contracts";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 1_000_000)
      return Response.json(
        { error: "This conversation is too large. Clear the chat and try again." },
        { status: 413, headers },
      );
    body = JSON.parse(text);
  } catch {
    return Response.json(
      { error: "Send a valid recipe message and kitchen context." },
      { status: 400, headers },
    );
  }
  const parsed = chatMealsRequestSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check your message, pantry quantities, and meal preferences." },
      { status: 400, headers },
    );
  try {
    const result = chatMealsResponseSchema.parse(
      await chatAboutMeals(parsed.data),
    );
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: "Recipe chat is unavailable. Please try again." },
      { status: 500, headers },
    );
  }
}
