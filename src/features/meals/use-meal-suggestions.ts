"use client";

import { useEffect, useRef, useState } from "react";
import { mealFailureMessage, mealRequestError } from "@/features/meals/client-request";
import { rememberRecipeNames } from "@/features/meals/suggestion-history";
import {
  suggestMealsResponseSchema,
  type SuggestMealsResponse,
} from "@/lib/contracts";

type SuggestionResult = {
  key: string;
  response?: SuggestMealsResponse;
  error?: string;
};
export function useMealSuggestions(request: string, kitchenKey = request) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const latestRequest = useRef(request);
  const activeRequest = useRef<AbortController | null>(null);
  const recentRecipeNames = useRef<string[]>([]);
  const requestKey = `${retry}:${kitchenKey}`;
  const loading = result?.key !== requestKey;
  const current = loading ? null : result;

  // Saving a recipe updates ingredient references without spending another AI request.
  useEffect(() => { latestRequest.current = request; }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    async function loadSuggestions() {
      try {
        const response = await fetch("/api/meals/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...JSON.parse(latestRequest.current),
            recentRecipeNames: recentRecipeNames.current,
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(50000),
          ]),
        });
        if (!response.ok)
          throw new Error(await mealRequestError(response));
        const parsed = suggestMealsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success)
          throw new Error(
            "Those meal ideas weren’t quite right. Please try again.",
          );
        if (!controller.signal.aborted) {
          recentRecipeNames.current = rememberRecipeNames(
            recentRecipeNames.current,
            parsed.data.recipes,
          );
          setResult({ key: requestKey, response: parsed.data });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error: mealFailureMessage(error),
          });
      }
    }
    void loadSuggestions();
    return () => controller.abort();
  }, [requestKey]);

  return {
    loading,
    current,
    refresh: () => setRetry((value) => value + 1),
    cancel: () => {
      activeRequest.current?.abort();
      setResult({ key: requestKey, error: "Search stopped. Try again whenever you’re ready." });
    },
  };
}
