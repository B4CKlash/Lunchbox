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
import { getAiMode } from "./ai-runtime";
import { liveChatAboutMeals, liveSuggestMeals, type LiveProviderOptions } from "./live-provider";

// Server provider boundary. Future live adapters must preserve these contracts,
// validate generated recipes, and report their actual source without silent fallback.
export async function suggestMeals(
  input: SuggestMealsRequest,
  options: LiveProviderOptions = {},
): Promise<SuggestMealsResponse> {
  return suggestMealsResponseSchema.parse(
    await (getAiMode() === "ai" ? liveSuggestMeals(suggestMealsRequestSchema.parse(input), options) : demoSuggestMeals(suggestMealsRequestSchema.parse(input))),
  );
}

export async function chatAboutMeals(
  input: ChatMealsRequest,
  options: LiveProviderOptions = {},
): Promise<ChatMealsResponse> {
  return chatMealsResponseSchema.parse(
    await (getAiMode() === "ai" ? liveChatAboutMeals(chatMealsRequestSchema.parse(input), options) : demoChatAboutMeals(chatMealsRequestSchema.parse(input))),
  );
}
