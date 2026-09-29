import { suggestMeals } from "@/features/meals/demo-provider";
import {
  suggestMealsRequestSchema,
  suggestMealsResponseSchema,
} from "@/lib/contracts";

export async function POST(request: Request) {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 100000)
      return Response.json(
        { error: "This pantry is too large to process." },
        { status: 413 },
      );
    body = JSON.parse(text);
  } catch {
    return Response.json(
      { error: "Send a valid JSON pantry and preferences." },
      { status: 400 },
    );
  }
  const parsed = suggestMealsRequestSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check your pantry quantities and meal preferences." },
      { status: 400 },
    );
  try {
    const result = suggestMealsResponseSchema.parse(
      await suggestMeals(parsed.data),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Meal suggestions are unavailable. Please try again." },
      { status: 500 },
    );
  }
}
