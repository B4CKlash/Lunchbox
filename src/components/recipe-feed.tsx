"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Pause, Play, Sparkles } from "lucide-react";
import { RecipeCard } from "@/components/recipe-card";
import { formatMealRetryTime } from "@/features/meals/client-request";
import type { MealRequestWait } from "@/features/meals/meal-retry";
import type { SuggestionBlock } from "@/lib/contracts";

type RecipeFeedProps = {
  aiMode: "demo" | "ai";
  blocks: SuggestionBlock[];
  contextKey: string;
  direction: string;
  streamEnabled: boolean;
  loading: boolean;
  error?: string | null;
  explanation?: string | null;
  waiting: MealRequestWait | null;
  cooldownActive: boolean;
  cooldownUntil: number;
  onDirection: (direction: string) => void;
  onNext: () => void;
  onPause: () => void;
  onResume: () => void;
  onNotice: (message: string) => void;
};

export function RecipeFeed({ aiMode, blocks, contextKey, direction, streamEnabled, loading, error, explanation, waiting, cooldownActive, cooldownUntil, onDirection, onNext, onPause, onResume, onNotice }: RecipeFeedProps) {
  const [draft, setDraft] = useState(direction);
  const count = blocks.reduce((total, block) => total + block.recipes.length, 0);
  const live = aiMode === "ai";

  function steer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onDirection(draft.trim());
  }

  return (
    <div className="recipe-feed">
      {live ? (
        <section className="feed-steering" aria-labelledby="feed-direction-heading">
          <div>
            <p className="eyebrow">FOLLOW YOUR APPETITE</p>
            <h3 id="feed-direction-heading">Where should the next block go?</h3>
            <p className="muted">Ask for a cuisine, a kind of meal, or an ingredient to explore. Your saved food preferences still apply.</p>
          </div>
          <form className="feed-direction-form" onSubmit={steer}>
            <label className="field">
              Direction for new recipes
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="More high-protein lunches, and use my apples…" />
            </label>
            <button className="button" type="submit"><Sparkles size={16} aria-hidden="true" /> Shape next block</button>
          </form>
          {direction ? <p className="feed-direction-note">Current direction: {direction}</p> : null}
        </section>
      ) : null}
      <div className="feed-toolbar">
        <div>
          <strong>{count ? `${count} recipes to explore` : live ? "A fresh block is on its way" : "Your sample ideas"}</strong>
          <p className="muted">{live
            ? streamEnabled ? "Up to six recipes per block. New blocks arrive while this feed is open." : "Stream paused. Browse your recipes or request another block."
            : "Demo uses a fixed recipe collection. Direction prompts are available with live AI."}</p>
        </div>
        {live ? <button className="button secondary" onClick={streamEnabled || loading ? onPause : onResume}>
          {streamEnabled || loading ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {streamEnabled || loading ? "Pause stream" : "Resume stream"}
        </button> : null}
      </div>
      {blocks[0]?.sequence > 1 ? <p className="muted">Showing your recent blocks. Save favorites to keep them in your recipe box.</p> : null}
      {blocks.map((block) => (
        <section className="feed-block" key={block.id} aria-label={`Recipe block ${block.sequence}`}>
          <div className="feed-block-heading">
            <div>
              <h3>Block {block.sequence} <span className="muted">· {block.recipes.length} recipes</span></h3>
              <p className="muted">{block.direction || "Inspired by your kitchen"} · {block.servings} servings</p>
            </div>
            {block.contextKey !== contextKey ? <span className="pill">Earlier kitchen or direction</span> : null}
          </div>
          {block.explanation ? <p className="status-message">{block.explanation}</p> : null}
          <div className="recipe-grid">
            {block.recipes.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} source={block.source} servings={block.servings} index={index} onNotice={onNotice} />)}
          </div>
        </section>
      ))}
      <div className={`feed-progress${!blocks.length ? " card empty-state" : ""}`}>
        {loading ? <>
          <LoaderCircle className="spinning" size={24} aria-hidden="true" />
          <p role="status">{waiting
            ? `AI is busy. ${waiting.retrying ? "We’ll retry once" : "The next request will start"} after ${formatMealRetryTime(waiting.until)}.`
            : live ? "Creating the next recipes…"
              : "Finding sample meals that fit your kitchen…"}</p>
          {!live ? <button className="button secondary" onClick={onPause}>Stop search</button> : null}
        </> : error ? <>
          <p className="error-message" role="alert">{error}</p>
          {blocks.length ? <p className="muted">Your earlier blocks are still here.</p> : null}
        </> : explanation ? <p role="status">{explanation}</p>
          : !blocks.length ? <p role="status">{live ? "Start a block, or give the agent a direction to explore." : "No sample recipes match. Try allowing more cooking time."}</p>
            : streamEnabled && live ? <p className="muted" role="status">This block is ready. The next one will begin shortly.</p> : null}
        {cooldownActive && !loading ? <p role="status">The next request can start after {formatMealRetryTime(cooldownUntil)}.</p> : null}
        <button className="button" onClick={onNext} disabled={loading || cooldownActive}>
          {live ? "Generate next block" : "Refresh sample ideas"} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
