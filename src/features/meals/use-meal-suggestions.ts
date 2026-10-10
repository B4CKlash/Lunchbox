"use client";

import { useEffect, useRef, useState } from "react";
import { mealFailureMessage, mealRequestFailure } from "@/features/meals/client-request";
import { withMealRateLimitRecovery, type MealRequestWait } from "@/features/meals/meal-retry";
import { generateRecipeBlock, RECIPE_BLOCK_DELAY_MS, waitForRecipeBlock } from "@/features/meals/recipe-feed";
import { requestWorkerRecipe } from "./local-recipe-request";
import { useMealCooldown } from "@/features/meals/use-meal-cooldown";
import { suggestMealsResponseSchema, type SuggestionBlock, type SuggestMealsRequest } from "@/lib/contracts";

type SuggestionOptions = {
  aiBackend?: "gateway" | "local-worker";
  enabled: boolean;
  resetVersion: number;
  aiMode: "ai" | "demo";
  aiCooldownUntil: number;
  deferAiRequests: (until: number) => void;
  recentRecipeNames: string[];
  blocks: SuggestionBlock[];
  streamEnabled: boolean;
  appendSuggestionBlock: (input: SuggestMealsRequest, block: SuggestionBlock) => Promise<{ ok: boolean; error?: string }>;
  setSuggestionStreamEnabled: (enabled: boolean) => void;
};
type FeedStatus = {
  contextKey: string;
  resetVersion: number;
  operation?: number;
  manualTicket?: number;
  loading: boolean;
  waiting?: MealRequestWait;
  error?: string;
  explanation?: string;
  nextAt?: number;
};

export function useMealSuggestions(request: string, contextKey: string, options: SuggestionOptions) {
  const { enabled, resetVersion, streamEnabled, aiMode, aiBackend = "gateway", aiCooldownUntil } = options;
  const [visible, setVisible] = useState(true);
  const [manualRequest, setManualRequest] = useState(0);
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const latest = useRef({ request, contextKey, ...options });
  const activeRequest = useRef<AbortController | null>(null);
  const phase = useRef<"loading" | "scheduled" | null>(null);
  const operationSequence = useRef(0);
  const manualSequence = useRef(0);
  const consumedManualRequest = useRef(0);
  const manualQueued = useRef(false);
  const cooldownActive = useMealCooldown(aiCooldownUntil);
  const current = status?.contextKey === contextKey && status.resetVersion === resetVersion ? status : null;

  // Persistence updates inform the next half-block without restarting this operation.
  useEffect(() => {
    latest.current = { request, contextKey, ...options };
  }, [request, contextKey, options]);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!enabled || !visible) return;
    const manual = manualRequest !== consumedManualRequest.current;
    if (!streamEnabled && !manual) return;
    consumedManualRequest.current = manualRequest;
    manualQueued.current = false;
    const operation = ++operationSequence.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    phase.current = "loading";
    const valid = () => !controller.signal.aborted && activeRequest.current === controller
      && latest.current.contextKey === contextKey && latest.current.resetVersion === resetVersion
      && latest.current.enabled && document.visibilityState === "visible";
    const updateStatus = (value: Omit<FeedStatus, "contextKey" | "resetVersion">) => {
      if (valid()) setStatus({ contextKey, resetVersion, operation, ...value });
    };
    const stop = (value: { error?: string; explanation?: string }) => {
      if (!valid()) return;
      updateStatus({ loading: false, ...value });
      latest.current.setSuggestionStreamEnabled(false);
    };
    async function run() {
      try {
        // Coalesce rapid preference edits before starting a paid request.
        await waitForRecipeBlock(350, controller.signal);
        do {
          controller.signal.throwIfAborted();
          if (!valid()) return;
          phase.current = "loading";
          updateStatus({ loading: true });
          const input: SuggestMealsRequest = JSON.parse(latest.current.request);
          const sequence = Math.max(0, ...latest.current.blocks.map((block) => block.sequence)) + 1;
          const seed = {
            id: crypto.randomUUID(), sequence, contextKey,
            direction: input.direction ?? "", servings: input.preferences.servings,
          };
          const outcome = await generateRecipeBlock({
            seed, aiMode, signal: controller.signal,
            getInput: () => ({ ...JSON.parse(latest.current.request), recentRecipeNames: latest.current.recentRecipeNames }),
            getExistingNames: () => latest.current.blocks.flatMap((block) => block.recipes.map((recipe) => recipe.name)),
            send: (input) => withMealRateLimitRecovery(async () => {
              if (!valid()) throw new DOMException("Recipe generation stopped", "AbortError");
              const response = aiMode === "ai" && aiBackend === "local-worker"
                ? await requestWorkerRecipe({ kind: "suggest", input }, AbortSignal.any([controller.signal, AbortSignal.timeout(240_000)]))
                : await fetch("/api/meals/suggest", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(50_000)]),
              });
              if (!response.ok) throw await mealRequestFailure(response);
              const parsed = suggestMealsResponseSchema.safeParse(await response.json());
              if (!parsed.success) throw new Error("Those meal ideas weren’t quite right. Please try again.");
              return parsed.data;
            }, {
              signal: controller.signal,
              getCooldownUntil: () => latest.current.aiCooldownUntil,
              deferRequests: (until) => latest.current.deferAiRequests(until),
              onWaiting: (waiting) => updateStatus({ loading: true, ...(waiting ? { waiting } : {}) }),
            }),
            onBatch: async (input, block) => {
              if (!valid()) return;
              const result = await latest.current.appendSuggestionBlock(input, block);
              if (!result.ok) throw new Error(result.error ?? "These recipes could not be saved. Please retry.");
            },
          });
          if (!valid()) return;
          if (outcome.outcome !== "complete") {
            stop({ explanation: outcome.explanation ?? (outcome.outcome === "duplicates"
              ? "No new dishes came back. Change the direction or generate another block when you’re ready."
              : outcome.outcome === "demo" ? "These are the available sample recipes."
                : "No recipes matched this request. Adjust your preferences or the direction for your next block.") });
            return;
          }
          if (!latest.current.streamEnabled) {
            updateStatus({ loading: false, explanation: outcome.explanation });
            return;
          }
          phase.current = "scheduled";
          updateStatus({ loading: false, explanation: outcome.explanation, nextAt: Date.now() + RECIPE_BLOCK_DELAY_MS });
          await waitForRecipeBlock(RECIPE_BLOCK_DELAY_MS, controller.signal);
        } while (valid() && latest.current.streamEnabled);
      } catch (error) {
        if (valid()) stop({ error: mealFailureMessage(error) });
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          phase.current = null;
        }
      }
    }
    void run();
    return () => {
      controller.abort();
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        phase.current = null;
      }
      // Also clear a suspended manual block if its promise finished before cleanup.
      // The operation token prevents an older cleanup from changing a newer search.
      setStatus((previous) => previous?.operation === operation || (manual && previous?.manualTicket === manualRequest)
        ? { ...previous, loading: false, waiting: undefined, nextAt: undefined }
        : previous);
    };
  }, [contextKey, resetVersion, enabled, visible, streamEnabled, manualRequest, aiMode, aiBackend]);

  function pause() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    phase.current = null;
    manualQueued.current = false;
    consumedManualRequest.current = manualSequence.current;
    latest.current.setSuggestionStreamEnabled(false);
    setStatus({ contextKey, resetVersion, loading: false });
  }
  function generateNext() {
    if (phase.current === "loading" || manualQueued.current || Date.now() < latest.current.aiCooldownUntil) return;
    activeRequest.current?.abort();
    activeRequest.current = null;
    phase.current = null;
    manualQueued.current = true;
    const ticket = ++manualSequence.current;
    setStatus({ contextKey, resetVersion, manualTicket: ticket, loading: true });
    setManualRequest(ticket);
  }
  function resume() {
    if (Date.now() < latest.current.aiCooldownUntil) return;
    setStatus({ contextKey, resetVersion, loading: true });
    latest.current.setSuggestionStreamEnabled(true);
  }

  return {
    loading: enabled && visible && (current?.loading ?? streamEnabled),
    waiting: enabled && visible && current?.loading ? current.waiting ?? null : null,
    error: current?.error ?? null,
    explanation: current?.explanation ?? null,
    paused: !streamEnabled,
    backgroundPaused: streamEnabled && (!enabled || !visible),
    nextAt: enabled && visible ? current?.nextAt ?? null : null,
    cooldownActive,
    generateNext, pause, resume,
  };
}
