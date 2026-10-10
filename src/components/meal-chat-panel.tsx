"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, LoaderCircle, MessageCircle, X } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { RecipeCard } from "@/components/recipe-card";
import { chatMealsResponseSchema } from "@/lib/contracts";
import { formatMealRetryTime, mealFailureMessage, mealRequestFailure } from "@/features/meals/client-request";
import { withMealRateLimitRecovery, type MealRequestWait } from "@/features/meals/meal-retry";
import { useMealCooldown } from "@/features/meals/use-meal-cooldown";
import { requestWorkerRecipeJob } from "@/features/meals/local-recipe-request";
import { chatMealsRequestSchema, type ChatMealsResponse } from "@/lib/contracts";
import { explicitProfileReply, extractExplicitProfileChanges } from "@/features/planning/profile";
import type { AiJob } from "@/features/meals/jobs";
import { recommendationContextKey } from "@/features/meals/recommendation-context";
import { planningUserMessageAuthor } from "@/features/meals/planning-message-author";

const prompts = [
  "What can I make tonight?",
  "Use my use-soon ingredients",
  "Find a quicker meal",
  "Review my plan",
];

export function MealChatPanel({
  onNotice,
  aiMode,
  aiBackend = "gateway",
  onImportUrl,
  active,
}: {
  onNotice: (message: string) => void;
  aiMode: "demo" | "ai";
  aiBackend?: "gateway" | "local-worker";
  active: boolean;
  onImportUrl: (url: string) => void;
}) {
  const {
    state,
    currentMemberId,
    householdId,
    setChatDraft,
    completeChatTurn,
    dispatchPilot,
    flushHouseholdChanges,
    pendingChange,
    chatResetVersion,
    clearChat,
    clearRecipeFocus,
    deferAiRequests,
  } = useHousehold();
  const { workspace } = state;
  const [pending, setPending] = useState<{
    key: string;
    prompt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<MealRequestWait | null>(null);
  const [retrySave, setRetrySave] = useState<{ key: string; message: string; jobId: string } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const completedReply = useRef<{ key: string; message: string; result: ChatMealsResponse; jobId: string; actorMemberId: string; baseRevision: number } | null>(null);
  const latestCooldown = useRef({ until: workspace.aiCooldownUntil, deferAiRequests });
  const cooldownActive = useMealCooldown(workspace.aiCooldownUntil);
  const context = JSON.stringify({
    pantry: state.pantry,
    preferences: state.preferences,
    meals: workspace.calendar.draft ?? state.meals,
    planStatus: workspace.calendar.draft !== null ? "draft" : "committed",
    recipeBox: workspace.recipeBox,
    focusedRecipe: workspace.focusedRecipe ?? undefined,
    focusedServings: workspace.focusedServings ?? undefined,
  });
  const requestKey = JSON.stringify([householdId, currentMemberId, recommendationContextKey(state, currentMemberId ?? state.pilot?.members[0]?.id), context]);
  const loading = pending?.key === requestKey;
  const replyAlreadySaved = Boolean(retrySave && workspace.chatMessages.some((message) => message.id === `job-${retrySave.jobId}-assistant`));

  useEffect(() => {
    latestCooldown.current = { until: workspace.aiCooldownUntil, deferAiRequests };
  }, [workspace.aiCooldownUntil, deferAiRequests]);

  // A result from an older kitchen must never appear as a current recommendation.
  // Leaving Chat releases its request before the recipe feed resumes.
  useEffect(
    () => () => activeRequest.current?.abort(),
    [requestKey, chatResetVersion, active],
  );

  async function sendMessage(prompt: string) {
    const message = prompt.trim();
    if (!active || !message || loading || activeRequest.current) return;
    if (cooldownActive) {
      setError("AI is busy. Please wait before sending another message.");
      return;
    }
    if (/^https?:\/\/\S+$/i.test(message)) {
      onImportUrl(message);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    controller.signal.addEventListener(
      "abort",
      () => {
        if (activeRequest.current !== controller) return;
        activeRequest.current = null;
        setPending(null);
        setError(
          "Reply stopped. Your message is saved; send it again when you’re ready.",
        );
      },
      { once: true },
    );
    if (workspace.chatDraft !== message) setChatDraft(message);
    setPending({ key: requestKey, prompt: message });
    setError(null);
    setWaiting(null);
    try {
      const response = await withMealRateLimitRecovery(async () => {
        const snapshot = await flushHouseholdChanges();
        const cached = completedReply.current;
        if (cached?.key === requestKey && cached.message === message) {
          if (!snapshot.workspace.chatMessages.some((entry) => entry.id === `job-${cached.jobId}-assistant`)
            && snapshot.pilot?.revision === cached.baseRevision) return cached;
          // A global retry may already have saved it, or a conflict may have
          // superseded its revision. A new send needs a fresh authenticated job.
          completedReply.current = null; setRetrySave(null);
        }
        const actorMemberId = currentMemberId ?? snapshot.pilot?.members[0]?.id ?? "you";
        const input = chatMealsRequestSchema.parse({
          pantry: snapshot.pantry, preferences: snapshot.preferences,
          meals: snapshot.workspace.calendar.draft ?? snapshot.meals,
          planStatus: snapshot.workspace.calendar.draft !== null ? "draft" : "committed",
          recipeBox: snapshot.workspace.recipeBox, focusedRecipe: snapshot.workspace.focusedRecipe ?? undefined,
          focusedServings: snapshot.workspace.focusedServings ?? undefined,
          messages: snapshot.workspace.chatMessages, message,
        });
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(aiBackend === "local-worker" ? 240000 : 50000)]);
        let job: AiJob | undefined;
        let result: ChatMealsResponse;
        const memoryReply = snapshot.pilot && !householdId ? explicitProfileReply(snapshot, message, actorMemberId) : null;
        if (aiMode === "ai" && aiBackend === "local-worker") {
          job = await requestWorkerRecipeJob({ kind: "chat", input }, signal);
          if (job.result?.kind !== "chat" || !job.actorMemberId) throw new Error("The completed reply is missing its requesting person. Please retry.");
          result = job.result.data;
        } else {
          const fetched = memoryReply ? Response.json({ source: "demo", reply: memoryReply, recipes: [], servings: snapshot.preferences.servings })
            : await fetch("/api/meals/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
          if (!fetched.ok) throw await mealRequestFailure(fetched);
          const parsed = chatMealsResponseSchema.safeParse(await fetched.json());
          if (!parsed.success) throw new Error("That reply wasn’t in a usable format. Please try again.");
          result = parsed.data;
          if (snapshot.pilot && !householdId) result = { ...result, profileChanges: extractExplicitProfileChanges(snapshot, message, actorMemberId) };
        }
        return { key: requestKey, message, result, jobId: job?.id ?? crypto.randomUUID(), actorMemberId: job?.actorMemberId ?? actorMemberId, baseRevision: job?.householdRevision ?? snapshot.pilot?.revision ?? 0 };
      }, {
        signal: controller.signal,
        getCooldownUntil: () => latestCooldown.current.until,
        deferRequests: (until) => latestCooldown.current.deferAiRequests(until),
        onWaiting: setWaiting,
      });
      if (controller.signal.aborted) return;
      activeRequest.current = null;
      if (state.pilot && (!householdId || (aiMode === "ai" && aiBackend === "local-worker"))) {
        completedReply.current = response;
        setRetrySave({ key: response.key, message, jobId: response.jobId });
        const saved = await dispatchPilot({ type: "receive_recipe_chat_result", baseRevision: response.baseRevision, jobId: response.jobId,
          request: message, actorMemberId: response.actorMemberId, result: response.result, submittedDraft: message });
        if (!saved.ok) throw new Error(saved.error ?? "The reply could not be saved. Your draft is kept; retry saving it.");
        completedReply.current = null;
        setRetrySave(null);
      } else {
      completeChatTurn(
        [
          {
            id: crypto.randomUUID(),
            role: "user",
            text: message,
            recipes: [],
            servings: response.result.servings,
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: response.result.reply,
            source: response.result.source,
            recipes: response.result.recipes,
            servings: response.result.servings,
          },
        ],
        message,
      );
      }
      setPending(null);
    } catch (reason) {
      if (controller.signal.aborted) return;
      activeRequest.current = null;
      setPending(null);
      setError(
        mealFailureMessage(reason),
      );
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(workspace.chatDraft);
  }

  return (
    <section className="chat-workspace" aria-labelledby="chat-heading">
      <div className="card chat-intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A LITTLE HELP DECIDING</p>
            <h2 id="chat-heading">Let’s talk dinner.</h2>
          </div>
          <span className="pill demo-pill">{aiMode === "ai" ? "AI assistant" : "Demo assistant"}</span>
        </div>
        <p className="muted">
          {aiMode === "ai"
            ? "Ask for a favorite dish, use what’s in your kitchen, revise a recipe, or talk through your plan. Missing ingredients go on your shopping list when you commit your calendar."
            : "Explore sample recipes, check ingredients, or talk through your plan. This guided demo supports the prompts below and ingredient searches like “recipes with rice.”"}
        </p>
        <div className="prompt-chips">
          {prompts.map((prompt) => (
            <button
              className="prompt-chip"
              key={prompt}
              disabled={loading || cooldownActive}
              onClick={() => void sendMessage(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div
        className="chat-messages"
        role="log"
        aria-label="Dinner conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
        {workspace.chatMessages.length === 0 && !loading ? (
          <div className="chat-welcome">
            <MessageCircle size={23} aria-hidden="true" />
            <p>
              Start anywhere. A recipe you like can become tonight’s dinner or
              part of a bigger plan.
            </p>
          </div>
        ) : null}
        {workspace.chatMessages.map((message) => (
          <article
            className={`chat-message chat-message-${message.role}`}
            key={message.id}
          >
            <p className="eyebrow">
              {message.role === "user"
                ? planningUserMessageAuthor({ authorMemberId: message.authorMemberId, viewerMemberId: householdId ? currentMemberId : state.pilot?.members[0]?.id, members: state.pilot?.members ?? [], shared: Boolean(householdId) })
                : message.source === "ai"
                  ? "AI ASSISTANT"
                  : "DEMO ASSISTANT"}
            </p>
            <p className="chat-text">{message.text}</p>
            {message.recipes.length > 0 ? (
              <div className="recipe-grid">
                {message.recipes.map((recipe, index) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    source={message.source ?? "demo"}
                    servings={message.servings}
                    index={index}
                    onNotice={onNotice}
                  />
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {loading ? (
          <div className="chat-pending" role="status">
            <LoaderCircle size={17} className="spinning" aria-hidden="true" />
            {waiting ? `AI is busy. We’ll retry once at ${formatMealRetryTime(waiting.until)}.` : "Looking through your kitchen…"}
          </div>
        ) : null}
      </div>

      <form
        className="card chat-composer"
        onSubmit={submit}
        aria-busy={loading}
      >
        {workspace.focusedRecipe ? (
          <div className="recipe-focus">
            <span>
              Discussing <strong>{workspace.focusedRecipe.name}</strong> ·{" "}
              {workspace.focusedServings ?? state.preferences.servings} servings
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Stop discussing this recipe"
              onClick={clearRecipeFocus}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {workspace.focusedRecipe ? (
          <div className="prompt-chips focused-prompts">
            {[
              "What do I need for this recipe?",
              "How do I cook this recipe?",
            ].map((prompt) => (
              <button
                type="button"
                className="prompt-chip"
                disabled={loading || cooldownActive}
                key={prompt}
                onClick={() => void sendMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        <label htmlFor="meal-message">What’s on your mind?</label>
        <div className="composer-field">
          <textarea
            id="meal-message"
            rows={2}
            maxLength={1000}
            value={workspace.chatDraft}
            disabled={loading}
            onChange={(event) => setChatDraft(event.target.value)}
            placeholder="Try “recipes with lentils”"
          />
          <button
            className="button"
            disabled={loading || cooldownActive || !workspace.chatDraft.trim()}
            type="submit"
          >
            <ArrowUp size={17} aria-hidden="true" />
            <span>{loading ? waiting ? "Waiting…" : "Sending…" : cooldownActive ? "Please wait" : "Send"}</span>
          </button>
        </div>
        {error && !replyAlreadySaved ? (
          <p className="error-message" role="alert">
            {error}
            {retrySave?.key === requestKey ? pendingChange
              ? " Use Retry saving in the household notice above to retry the original save."
              : <button type="button" className="text-button" onClick={() => void sendMessage(retrySave.message)}>Retry saving reply</button> : null}
          </p>
        ) : null}
        {!loading && cooldownActive ? (
          <p className="status-message" role="status">Your message is still here. Sending will be available after {formatMealRetryTime(workspace.aiCooldownUntil)}.</p>
        ) : null}
        {pending && !loading ? (
          <p className="error-message" role="status">
            Your kitchen changed while I was looking. Send your message again to
            use the latest details.
          </p>
        ) : null}
        <div className="composer-footer">
          <p className="footnote">
            {aiMode === "ai" ? "AI replies" : "Demo replies"} · last 20 messages saved in your kitchen
          </p>
          {loading ? (
            <button className="text-button" type="button" onClick={() => {
              activeRequest.current?.abort();
              setPending(null);
              setError("Reply stopped. Your message is still here.");
            }}>Stop reply</button>
          ) : null}
          <button
            type="button"
            className="text-button"
            disabled={
              !workspace.chatMessages.length &&
              !workspace.chatDraft &&
              !workspace.focusedRecipe &&
              !pending
            }
            onClick={() => {
              activeRequest.current?.abort();
              setPending(null);
              setError(null);
              clearChat();
            }}
          >
            Clear conversation
          </button>
        </div>
      </form>
    </section>
  );
}
