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
import { chatAboutMeals as demoChatAboutMeals } from "./chat-provider";
import { suggestMeals as demoSuggestMeals } from "./demo-provider";

// Server provider boundary. Future live adapters must preserve these contracts,
// validate generated recipes, and report their actual source without silent fallback.
export async function suggestMeals(
  input: SuggestMealsRequest,
): Promise<SuggestMealsResponse> {
  return suggestMealsResponseSchema.parse(
    await demoSuggestMeals(suggestMealsRequestSchema.parse(input)),
  );
}

export async function chatAboutMeals(
  input: ChatMealsRequest,
): Promise<ChatMealsResponse> {
  return chatMealsResponseSchema.parse(
    await demoChatAboutMeals(chatMealsRequestSchema.parse(input)),
  );
}
