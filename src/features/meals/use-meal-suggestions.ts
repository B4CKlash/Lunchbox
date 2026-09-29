"use client";

import { useEffect, useState } from "react";
import {
  suggestMealsResponseSchema,
  type SuggestMealsResponse,
} from "@/lib/contracts";

type SuggestionResult = {
  key: string;
  response?: SuggestMealsResponse;
  error?: string;
};
export function useMealSuggestions(request: string) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const requestKey = `${retry}:${request}`;
  const loading = result?.key !== requestKey;
  const current = loading ? null : result;

  useEffect(() => {
    const controller = new AbortController();
    async function loadSuggestions() {
      try {
        const response = await fetch("/api/meals/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        });
        if (!response.ok)
          throw new Error(
            "We couldn’t load your meal ideas. Please try again.",
          );
        const parsed = suggestMealsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success)
          throw new Error(
            "Those meal ideas weren’t quite right. Please try again.",
          );
        if (!controller.signal.aborted)
          setResult({ key: requestKey, response: parsed.data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error:
              error instanceof Error && error.name === "Error"
                ? error.message
                : "We couldn’t load your meal ideas. Please try again.",
          });
      }
    }
    void loadSuggestions();
    return () => controller.abort();
  }, [request, requestKey]);

  return { loading, current, refresh: () => setRetry((value) => value + 1) };
}
