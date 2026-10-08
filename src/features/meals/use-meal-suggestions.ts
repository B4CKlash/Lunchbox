"use client";

import { useEffect, useRef, useState } from "react";
import { mealFailureMessage, mealRequestFailure } from "@/features/meals/client-request";
import { withMealRateLimitRecovery, type MealRequestWait } from "@/features/meals/meal-retry";
import { requestWorkerRecipe } from "./local-recipe-request";
import { useMealCooldown } from "@/features/meals/use-meal-cooldown";
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
  aiMode?: "demo" | "ai";
  enabled: boolean;
  resetVersion: number;
  aiCooldownUntil: number;
  deferAiRequests: (until: number) => void;
  recentRecipeNames: string[];
  recordSuggestions: (input: SuggestMealsRequest, recipes: Recipe[]) => void;
};

export function useMealSuggestions(
  request: string,
  kitchenKey: string,
  { enabled, resetVersion, aiCooldownUntil, deferAiRequests, recentRecipeNames, recordSuggestions, aiMode = "demo" }: SuggestionOptions,
) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [previous, setPrevious] = useState<{ response: SuggestMealsResponse; servings: number; resetVersion: number } | null>(null);
  const [waiting, setWaiting] = useState<(MealRequestWait & { key: string }) | null>(null);
  const latest = useRef({ request, recentRecipeNames, recordSuggestions, aiCooldownUntil, deferAiRequests });
  const activeRequest = useRef<AbortController | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRequestKey = useRef<string | null>(null);
  const requestKey = `${retry}:${kitchenKey}`;
  const loading = enabled && result?.key !== requestKey;
  const current = result?.key === requestKey ? result : null;
  const cooldownActive = useMealCooldown(aiCooldownUntil);

  // Saved history and ingredient references inform the next request without
  // starting another generation when the current result is recorded.
  useEffect(() => {
    latest.current = { request, recentRecipeNames, recordSuggestions, aiCooldownUntil, deferAiRequests };
  }, [request, recentRecipeNames, recordSuggestions, aiCooldownUntil, deferAiRequests]);

  useEffect(() => {
    if (!enabled || settledRequestKey.current === requestKey) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    async function loadSuggestions() {
      try {
        const { input, response } = await withMealRateLimitRecovery(async () => {
          const input: SuggestMealsRequest = {
            ...JSON.parse(latest.current.request),
            recentRecipeNames: latest.current.recentRecipeNames,
          };
          const response = aiMode === "ai" ? await requestWorkerRecipe({ kind: "suggest", input }, AbortSignal.any([controller.signal, AbortSignal.timeout(240000)])) : await fetch("/api/meals/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]),
          });
          if (!response.ok) throw await mealRequestFailure(response);
          const parsed = suggestMealsResponseSchema.safeParse(await response.json());
          if (!parsed.success)
            throw new Error("Those meal ideas weren’t quite right. Please try again.");
          return { input, response: parsed.data };
        }, {
          signal: controller.signal,
          getCooldownUntil: () => latest.current.aiCooldownUntil,
          deferRequests: (until) => latest.current.deferAiRequests(until),
          onWaiting: (value) => setWaiting(value ? { ...value, key: requestKey } : null),
        });
        if (!controller.signal.aborted && activeRequest.current === controller) {
          if (response.recipes.length) {
            latest.current.recordSuggestions(input, response.recipes);
            setPrevious({ response, servings: input.preferences.servings, resetVersion });
          }
          settledRequestKey.current = requestKey;
          setResult({ key: requestKey, response });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          settledRequestKey.current = requestKey;
          setResult({
            key: requestKey,
            error: mealFailureMessage(error),
          });
        }
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
  }, [requestKey, enabled, resetVersion, aiMode]);

  return {
    loading,
    current,
    previous: previous?.resetVersion === resetVersion ? previous : null,
    waiting: loading && waiting?.key === requestKey ? waiting : null,
    cooldownActive,
    refresh: () => {
      if (Date.now() < latest.current.aiCooldownUntil) return;
      setRetry((value) => value + 1);
    },
    cancel: () => {
      if (pendingTimer.current !== null) clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
      activeRequest.current?.abort();
      settledRequestKey.current = requestKey;
      setResult({ key: requestKey, error: "Search stopped. Try again whenever you’re ready." });
    },
  };
}
