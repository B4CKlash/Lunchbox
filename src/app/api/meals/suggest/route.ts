import { createMealHandlers } from "@/features/meals/api-handlers";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createMealHandlers().suggest;
