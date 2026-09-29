"use client";

import { useEffect, useRef, useState } from "react";
import { mealFailureMessage, mealRequestError } from "@/features/meals/client-request";
import {
  suggestMealsResponseSchema,
  type Recipe,
  type SuggestMealsRequest,
  type SuggestMealsResponse,
} from "@/lib/contracts";

type SuggestionResult = {
  key: string;
  response?: SuggestMealsResponse;
  error?: string;
};
type SuggestionOptions = {
  recentRecipeNames: string[];
  recordSuggestions: (input: SuggestMealsRequest, recipes: Recipe[]) => void;
};

export function useMealSuggestions(
  request: string,
  kitchenKey: string,
  { recentRecipeNames, recordSuggestions }: SuggestionOptions,
) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const latest = useRef({ request, recentRecipeNames, recordSuggestions });
  const activeRequest = useRef<AbortController | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestKey = `${retry}:${kitchenKey}`;
  const loading = result?.key !== requestKey;
  const current = loading ? null : result;

  // Saved history and ingredient references inform the next request without
  // starting another generation when the current result is recorded.
  useEffect(() => {
    latest.current = { request, recentRecipeNames, recordSuggestions };
  }, [request, recentRecipeNames, recordSuggestions]);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    async function loadSuggestions() {
      try {
        const input: SuggestMealsRequest = {
          ...JSON.parse(latest.current.request),
          recentRecipeNames: latest.current.recentRecipeNames,
        };
        const response = await fetch("/api/meals/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
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
        if (!controller.signal.aborted && activeRequest.current === controller) {
          if (parsed.data.recipes.length)
            latest.current.recordSuggestions(input, parsed.data.recipes);
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
    const timer = setTimeout(() => {
      pendingTimer.current = null;
      void loadSuggestions();
    }, 350);
    pendingTimer.current = timer;
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        pendingTimer.current = null;
      }
    };
  }, [requestKey]);

  return {
    loading,
    current,
    refresh: () => setRetry((value) => value + 1),
    cancel: () => {
      if (pendingTimer.current !== null) clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
      activeRequest.current?.abort();
      setResult({ key: requestKey, error: "Search stopped. Try again whenever you’re ready." });
    },
  };
}
