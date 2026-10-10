"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Bookmark, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, CookingPot, Leaf, MessageCircle, Plus, Send, ShoppingBasket, Snowflake, Star, Undo2, Users, Utensils } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { ProfileMemory } from "@/components/profile-memory";
import { LocalPlanningAssistant, type LocalAssistantHandle } from "@/components/local-planning-assistant";
import { fixtureRecipeForRequest } from "@/features/meals/planning-fixtures";
import { buildRecommendationContext, recommendationContextForMessage } from "@/features/meals/recommendation-context";
import { planningUserMessageAuthor } from "@/features/meals/planning-message-author";
import { explicitProfileReply, extractExplicitProfileChanges } from "@/features/planning/profile";
import { isPlanningRefresh, planningRefreshFingerprint, planningRefreshSummary, planningResponseChanges, planningResponseCandidates } from "@/features/meals/planning-refresh";
import type { AiJob } from "@/features/meals/jobs";
import { addDays, calendarDates } from "@/features/planning/calendar";
import { buildPilotShoppingList, getMealCoverage } from "@/features/planning/pilot";
import { previewCandidateShopping } from "@/features/planning/candidate-shopping";
import { directPlacementForRequest } from "@/features/planning/direct-placement";
import { createSettingsDraft, resolveSettingsDraft } from "@/features/planning/settings-draft";
import { packageStockLabel } from "@/features/pantry/natural-stock-entry";
import { proposalReviewFingerprint, readProposalReview } from "@/features/pantry/storage";
import { calendarDateSchema, type CookingBatch, type HouseholdState, type MealSlot, type PilotChange, type PilotOperation, type PlanningProposal, type PlanningSession, type PreparedPortions, type PurchaseItem as PurchasedIngredient, type Recipe, type ShoppingItem } from "@/lib/contracts";
import styles from "./planning-workspace.module.css";

type RunCommand = (operation: PilotOperation) => Promise<boolean>;
const id = () => crypto.randomUUID();
const amount = (quantity: number, unit: string) => `${quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);
const slotLabel = (slot: string) => `${slot.slice(0, 1).toUpperCase()}${slot.slice(1)}`;
const slotOptions: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

function describeChange(change: PilotChange, state: HouseholdState) {
  const person = (memberId: string) => state.pilot?.members.find((member) => member.id === memberId)?.name ?? memberId;
  const mealDescription = (allocationId: string) => {
    const allocation = state.pilot?.allocations.find((entry) => entry.id === allocationId);
    if (!allocation) return `meal ${allocationId}`;
    const batch = state.pilot?.batches.find((entry) => entry.id === allocation.batchId);
    return `${person(allocation.memberId)} · ${dateLabel(allocation.date)} ${allocation.slot} · ${allocation.portions} portion of ${batch?.recipe.name ?? "prepared food"}`;
  };
  if (change.type === "create_batch") return `${change.batch.recipe.name}: cook ${change.batch.yield} portions on ${dateLabel(change.batch.prepareDate)}${change.batch.reservedExtra ? `, including ${change.batch.reservedExtra} reserved extra` : ""}. ${change.allocations.map((allocation) => `${state.pilot?.members.find((member) => member.id === allocation.memberId)?.name ?? "Member"} · ${dateLabel(allocation.date)} ${allocation.slot} (${allocation.portions})`).join("; ")}.`;
  if (change.type === "set_coverage") return `${state.pilot?.members.find((member) => member.id === change.coverage.memberId)?.name ?? "Member"}: ${dateLabel(change.coverage.date)} ${change.coverage.slot} ${change.coverage.reason === "eating-out" ? "eating out" : "covered"}.`;
  if (change.type === "allocate") return `Allocate ${change.allocation.portions} portion of ${state.pilot?.batches.find((batch) => batch.id === change.allocation.batchId)?.recipe.name ?? "prepared food"} to ${person(change.allocation.memberId)} on ${dateLabel(change.allocation.date)} ${change.allocation.slot}.`;
  if (change.type === "remove_allocation") return `Remove ${mealDescription(change.allocationId)}.`;
  if (change.type === "clear_coverage") {
    const coverage = state.pilot?.coverage.find((entry) => entry.id === change.coverageId);
    return coverage ? `Reopen ${person(coverage.memberId)}’s ${dateLabel(coverage.date)} ${coverage.slot}.` : `Reopen coverage ${change.coverageId}.`;
  }
  if (change.type === "confirm_stock") return `Confirm that you have enough ${state.pantry.find((item) => item.id === change.ingredientId)?.name ?? change.ingredientId} (${change.unit}) for the current requirements.`;
  if (change.type === "set_package_stock") return `Replace current container stock: ${change.stock.name}, ${packageStockLabel(change.stock)}. Contents unresolved. Original statement: ${change.stock.sourceNote ?? "Manual stock update"}.`;
  if (change.type === "record_package_purchase") return `Record package purchase: ${change.items.map((item) => `${item.name}, ${packageStockLabel({ ...item, status: "exact" })}`).join(", ")}. Contents unresolved.`;
  if (change.type === "record_purchase") return `Record purchase: ${change.items.map((item) => `${item.name} ${amount(item.quantity, item.unit)}`).join(", ")}.`;
  if (change.type === "cook_batch") return `Confirm cooked: ${state.pilot?.batches.find((batch) => batch.id === change.batchId)?.recipe.name ?? change.batchId}, ${change.actualPortions} portions made, ${change.freezerPortions} frozen.`;
  if (change.type === "correct_prepared") return `Correct ${state.pilot?.batches.find((batch) => batch.id === change.batchId)?.recipe.name ?? change.batchId}: ${change.produced} total portions made, ${change.freezerPortions} remaining in the freezer; reopen ${change.reopenAllocationIds.length} mistaken eaten meals. Reason: ${change.reason}. Recorded ingredient use stays unchanged.`;
  if (change.type === "set_stock") return `Update ${change.stock.name}: ${change.stock.status === "exact" ? amount(change.stock.quantity ?? 0, change.stock.unit) : change.stock.status}.`;
  if (change.type === "set_shop_through") return `Shop for cooking through ${dateLabel(change.date)}.`;
  if (change.type === "record_feedback") return `Save rating ${change.feedback.rating}/5 for ${state.pilot?.batches.find((batch) => batch.recipe.id === change.feedback.recipeId)?.recipe.name ?? state.pilot?.session.candidates.find((recipe) => recipe.id === change.feedback.recipeId)?.name ?? change.feedback.recipeId}; ${change.feedback.makeAgain ? "make again" : "do not prioritize again"}. ${change.feedback.notes}`;
  if (change.type === "set_members") return `Household people: ${change.members.map((member) => `${member.name}${member.preferences ? ` (${member.preferences})` : ""}`).join(", ")}.`;
  if (change.type === "remove_batch") return `Cancel cooking batch: ${state.pilot?.batches.find((batch) => batch.id === change.batchId)?.recipe.name ?? change.batchId}.`;
  if (change.type === "consume") return `Record ${mealDescription(change.allocationId)} as eaten${change.fromFreezer ? " from the freezer" : ""}.`;
  return "Review this household change.";
}

export function PlanningWorkspace() {
  const { state, dispatchPilot, saveRecipe, householdId, currentMemberId, planningComposer, setPlanningComposer, storageError } = useHousehold();
  const pilot = state.pilot!;
  const session = pilot.session;
  const [view, setView] = useState<"conversation" | "calendar" | "context">("conversation");
  const draft = planningComposer.draft;
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const setDraft = (text: string) => { draftRef.current = text; setPlanningComposer({ draft: text }); };
  const clearSubmittedDraft = (submitted: string) => { if (draftRef.current === submitted) setDraft(""); };
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assistantMode = planningComposer.mode;
  const setAssistantMode = (mode: "fixture" | "local") => setPlanningComposer({ mode });
  const sending = useRef(false);
  const rejecting = useRef(false);
  const localAssistant = useRef<LocalAssistantHandle>(null);
  const dates = calendarDates(session.startDate, session.days);
  const focusDate = session.focusDate ?? session.startDate;
  const focusSlot = session.focusSlot ?? "lunch";
  const focusedRecipe = session.candidates.find((recipe) => recipe.id === session.focusedRecipeId && !session.rejectedRecipeIds.includes(recipe.id));
  const recipeIsSaved = state.workspace.recipeBox.some((entry) => entry.recipe.id === focusedRecipe?.id);
  const focusCoverage = getMealCoverage(state, focusDate, focusSlot);
  const focusedMembers = pilot.members.filter((member) => session.memberIds.includes(member.id));
  const latestReceipt = [...pilot.receipts].reverse().find((receipt) => receipt.operationType !== "set_session" && (receipt.operationType !== "receive_planning_result" || Boolean(receipt.inverse)));
  const proposals = pilot.proposals.filter((proposal) => proposal.status !== "applied");
  const appliedProposals = pilot.proposals.filter((proposal) => proposal.status === "applied");
  const filled = dates.reduce((total, date) => total + session.slots.reduce((slots, slot) => slots + getMealCoverage(state, date, slot).filter((entry) => session.memberIds.includes(entry.member.id) && (entry.coverage || entry.allocation)).length, 0), 0);
  const target = dates.length * session.slots.length * focusedMembers.length;

  const run: RunCommand = async (operation) => {
    setNotice(null);
    try {
      const result = await dispatchPilot(operation);
      if (!result.ok) setNotice(result.error ?? "This change could not be saved. Try again.");
      return result.ok;
    } catch {
      setNotice("This change could not be saved. Check your connection, then try again.");
      return false;
    }
  };

  const setSession = (patch: Partial<PlanningSession>) => run({ type: "set_session", session: { ...session, ...patch } });
  const refreshIdeas = (reason: string) => { if (assistantMode === "local") localAssistant.current?.refreshIdeas(reason); };
  async function focusOccasion(date: string, slot: MealSlot) {
    if (date === session.focusDate && slot === session.focusSlot) return;
    if (await setSession({ focusDate: date, focusSlot: slot })) refreshIdeas(`you selected ${dateLabel(date, { weekday: "long", month: "short", day: "numeric" })} ${slot}`);
  }

  async function receiveLocalResult(job: AiJob) {
    if (job.result?.kind !== "planning" || job.request.kind !== "planning") return false;
    if (job.householdRevision !== pilot.revision || job.sessionId !== session.id) {
      setNotice("The household changed while the local assistant was working. Retry against the current plan.");
      return false;
    }
    const result = job.result.data;
    const recipes = result.recipes.filter((recipe) => !session.rejectedRecipeIds.includes(recipe.id));
    const automatic = isPlanningRefresh(job.request.message);
    const changes = planningResponseChanges(job.request.message, result.operations);
    const direct = !automatic && job.actorMemberId ? directPlacementForRequest(state, job.request.message, job.actorMemberId, result.operations) : null;
    const nextSession: PlanningSession = { ...session,
      draft: automatic ? session.draft : "",
      candidates: planningResponseCandidates(session, recipes, automatic),
      focusedRecipeId: automatic && focusedRecipe ? focusedRecipe.id : recipes[0]?.id ?? focusedRecipe?.id ?? null,
      messages: [...session.messages, { id: `job-${job.id}-${automatic ? "context" : "user"}`, role: automatic ? "assistant" : "user", ...(automatic ? {} : { authorMemberId: job.actorMemberId }), text: planningRefreshSummary(job.request.message), recipes: [], servings: state.preferences.servings }, { id: `job-${job.id}-assistant`, role: "assistant", source: "ai", text: `${result.reply.slice(0, 1870)}\n\n${automatic ? "Ideas only. Your existing meals and inventory are unchanged." : direct ? "Your explicit meal placement is saved with the action receipt below." : "Suggestions only. Calendar and inventory changes require your review."}`, recipes, servings: state.preferences.servings }].slice(-100) as PlanningSession["messages"],
    };
    // The transcript and its reviewable proposal are one validated mutation.
    // A rejected proposal must never leave a transcript marker that suppresses retry.
    return run({ type: "receive_planning_result", baseRevision: job.householdRevision, session: nextSession,
      ...(!automatic && result.profileChanges?.length && job.actorMemberId ? { profileSource: { jobId: job.id, request: job.request.message, actorMemberId: job.actorMemberId, changes: result.profileChanges } } : {}),
      ...(direct && job.actorMemberId ? { directPlacement: { jobId: job.id, request: job.request.message, actorMemberId: job.actorMemberId, change: direct } }
        : changes.length ? { proposal: { id: `local-${job.id}`, title: "Local assistant proposal · review each change", changes } } : {}),
    });
  }

  async function focusRecipe(recipe: Recipe) {
    const candidates = [...session.candidates.filter((entry) => entry.id !== recipe.id), recipe].slice(-30);
    if (await setSession({ candidates, focusedRecipeId: recipe.id, rejectedRecipeIds: session.rejectedRecipeIds.filter((recipeId) => recipeId !== recipe.id) })) {
      setView("context");
      refreshIdeas(`you’re discussing ${recipe.name}`);
    }
  }

  async function rejectRecipe(recipe: Recipe) {
    if (rejecting.current) return;
    rejecting.current = true;
    try {
      if (await setSession({ rejectedRecipeIds: [...new Set([...session.rejectedRecipeIds, recipe.id])].slice(-200), focusedRecipeId: null })) refreshIdeas(`you passed on ${recipe.name} and would like another idea`);
    } finally { rejecting.current = false; }
  }

  function createBatchChange(recipe: Recipe, occasions: { date: string; slot: MealSlot }[], freezer = 0): PilotChange | null {
    const batchId = id();
    const allocations = occasions.flatMap(({ date, slot }) => getMealCoverage(state, date, slot)
      .filter((entry) => session.memberIds.includes(entry.member.id) && !entry.coverage && !entry.allocation)
      .map((entry) => ({ id: id(), batchId, memberId: entry.member.id, date, slot, portions: 1 })));
    if (!allocations.length && !freezer) return null;
    return { type: "create_batch", batch: { id: batchId, recipe, prepareDate: occasions[0]?.date ?? focusDate, yield: allocations.length + freezer, reservedExtra: freezer }, allocations };
  }

  async function proposeBatch(recipe = focusedRecipe, occasions = 3) {
    if (!recipe) { setNotice("Explore a recipe first, then review how its batch could cover your week."); return; }
    const open = dates.flatMap((date) => session.slots.map((slot) => ({ date, slot }))).filter(({ date, slot }) => getMealCoverage(state, date, slot).some((entry) => session.memberIds.includes(entry.member.id) && !entry.coverage && !entry.allocation)).slice(0, occasions);
    const change = createBatchChange(recipe, open);
    if (!change) { setNotice("The visible occasions are already covered. Choose another week or open an occasion."); return; }
    await run({ type: "propose", id: id(), title: `One ${recipe.name.toLowerCase()} batch · ${open.length} occasions`, changes: [change] });
    setView("calendar");
  }

  async function send(text: string) {
    if (assistantMode === "local") { localAssistant.current?.request(text); return; }
    if (!text.trim() || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const clean = text.trim().slice(0, 2000);
      const actor = householdId ? currentMemberId : pilot.members[0]?.id;
      const memoryReply = actor ? explicitProfileReply(state, clean, actor) : null;
      const profileChanges = actor ? extractExplicitProfileChanges(state, clean, actor) : [];
      if (memoryReply || profileChanges.length) {
        if (householdId) { setNotice("Use Local AI to save preferences from this conversation with an authenticated response. Your draft is kept."); return; }
        const jobId = id();
        const saved = await run({ type: "receive_planning_result", baseRevision: pilot.revision,
          session: { ...session, messages: [...session.messages, { id: `job-${jobId}-user`, role: "user", authorMemberId: actor!, text: clean, recipes: [], servings: state.preferences.servings }, { id: `job-${jobId}-assistant`, role: "assistant", source: "demo", text: memoryReply ?? "Your explicit preference can guide future meal ideas. Send your recipe request next.", recipes: [], servings: state.preferences.servings }].slice(-100) as PlanningSession["messages"] },
          ...(profileChanges.length ? { profileSource: { jobId, request: clean, actorMemberId: actor!, changes: profileChanges } } : {}),
        });
        if (saved) clearSubmittedDraft(text);
        return;
      }
      let recipes: Recipe[] = [];
      let reply: string;
      let action: PilotOperation | undefined;
      const fixtureContext = recommendationContextForMessage(buildRecommendationContext(state, actor), clean);
      const weekday = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(clean)?.[1]?.toLowerCase();
      const requestedDate = weekday ? dates.find((date) => dateLabel(date, { weekday: "long" }).toLowerCase() === weekday) : focusDate;
      const requestedSlot: MealSlot = /dinner/i.test(clean) ? "dinner" : /breakfast/i.test(clean) ? "breakfast" : /snack/i.test(clean) ? "snack" : focusSlot;
      if (/\b(covered|eating out|eat out|work covers)\b/i.test(clean)) {
        const actor = householdId ? pilot.members.find((member) => member.id === currentMemberId) : pilot.members[0];
        const member = /\b(wife|partner)\b/i.test(clean) ? pilot.members.find((member) => actor && member.id !== actor.id) : actor;
        if (!requestedDate || !member) reply = "Choose the date and person in the calendar, then mark their meal as covered. The fixture helper only understands weekdays in the visible calendar.";
        else if (/\b(we|both|everyone)\b/i.test(clean)) {
          reply = "I’ve prepared a coverage proposal for both of you. Review the people and occasion before applying it.";
          action = { type: "propose", id: id(), title: `${dateLabel(requestedDate)} ${requestedSlot} · household coverage`, changes: focusedMembers.map((person) => ({ type: "set_coverage", coverage: { id: id(), memberId: person.id, date: requestedDate, slot: requestedSlot, reason: /eat/i.test(clean) ? "eating-out" : "work" } })) };
        } else {
          reply = `Requested: mark ${member.name === "You" ? "your" : `${member.name}’s`} ${dateLabel(requestedDate)} ${requestedSlot} as ${/eat/i.test(clean) ? "eating out" : "covered by work"}. The action receipt below confirms whether it was saved.`;
          action = { type: "set_coverage", coverage: { id: id(), memberId: member.id, date: requestedDate, slot: requestedSlot, reason: /eat/i.test(clean) ? "eating-out" : "work" } };
        }
      } else if (/\b(put|place|schedule|add)\b.*\b(this|it)\b/i.test(clean) && focusedRecipe && requestedDate) {
        const change = createBatchChange(focusedRecipe, [{ date: requestedDate, slot: requestedSlot }]);
        reply = change ? `Requested: place ${focusedRecipe.name} on ${dateLabel(requestedDate)} ${requestedSlot} for the people with an open meal. See the saved-action receipt.` : "That occasion is already covered. Select the calendar cell to change an existing meal first.";
        action = change ?? undefined;
      } else if (/\b(fill|several days|batch|two lunches|three meals|whole week)\b/i.test(clean)) {
        recipes = focusedRecipe ? [focusedRecipe] : fixtureRecipeForRequest(state, "Explore a pasta recipe", fixtureContext).recipes;
        reply = recipes.length ? "One cooking batch can cover several occasions. I’ll show a proposal for the first three open occasions in this view. The groceries count this batch once; review before applying." : "Choose a recipe you want to consider before reviewing a batch. The earlier pasta example was passed over.";
      } else if (/freez/i.test(clean)) {
        reply = "Open the focused recipe’s placement controls and reserve extra portions before cooking. When you confirm cooking, record how many actually went into the freezer. Prepared food can then be scheduled later without creating another grocery requirement.";
      } else {
        ({ reply, recipes } = fixtureRecipeForRequest(state, clean, fixtureContext));
      }
      recipes = recipes.filter((recipe) => !session.rejectedRecipeIds.includes(recipe.id));
      const nextCandidates = planningResponseCandidates(session, recipes, false);
      const saved = await setSession({ draft: "", candidates: nextCandidates, focusedRecipeId: recipes[0]?.id ?? focusedRecipe?.id ?? null, messages: [...session.messages, { id: id(), role: "user" as const, authorMemberId: householdId ? currentMemberId ?? undefined : pilot.members[0]?.id, text: clean, recipes: [], servings: state.preferences.servings }, { id: id(), role: "assistant" as const, text: reply, source: "demo" as const, recipes, servings: state.preferences.servings }].slice(-100) });
      if (saved) {
        clearSubmittedDraft(text);
        if (action) await run(action);
        else if (recipes.length && /\b(fill|several days|batch|two lunches|three meals|whole week)\b/i.test(clean)) await proposeBatch(recipes[0]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The fixture request could not be completed.");
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }

  return <div className={styles.workspace}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>A LITTLE PLANNING. A GOOD WEEK.</span><h1>Let’s make room for good food.</h1><p>Talk it through, find something you love, and give every meal a place.</p></div>
      <div className={styles.topActions}><span className={styles.savedPill}><Users size={14} />{pilot.members.map((member) => member.name).join(" + ")}</span><Link href="/recipes" className={styles.quietButton}><Bookmark size={15} />Recipe library</Link></div>
    </header>
    <div className={styles.statusBar}><div><div className={styles.statusLabel}><span className={styles.statusDot} /><strong>{assistantMode === "fixture" ? "Fixture planning helper · authored examples" : "Local AI · private Mac worker"}</strong></div><p>{assistantMode === "fixture" ? "Authored examples prove the workflow. Calendar, groceries, and actions are saved household changes." : "Requests run through your household’s Mac worker. Specific meal placements apply with undo; broader plans are reviewed first."}</p></div><div className={styles.modePicker} role="group" aria-label="Assistant mode"><button aria-pressed={assistantMode === "fixture"} onClick={() => setAssistantMode("fixture")}>Fixtures</button><button aria-pressed={assistantMode === "local"} onClick={() => setAssistantMode("local")}>Local AI</button></div></div>
    {notice ? <p className={styles.notice} role="alert">{notice}</p> : null}
    <ProfileMemory />
    {latestReceipt ? <div className={styles.receipt} role="status"><span><Check size={16} />{latestReceipt.undoneBy ? "Undone: " : ""}{latestReceipt.summary}</span>{latestReceipt.inverse && !latestReceipt.undoneBy ? <button className={styles.smallButton} onClick={() => void run({ type: "undo", receiptId: latestReceipt.id })}><Undo2 size={13} />Undo</button> : null}</div> : null}
    <div className={styles.mobileNav} role="group" aria-label="Planning views">{([{ value: "conversation", label: "Conversation", Icon: MessageCircle }, { value: "calendar", label: "Calendar", Icon: CalendarDays }, { value: "context", label: "Food & shop", Icon: ShoppingBasket }] as const).map(({ value, label, Icon }) => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}><Icon size={15} />{label}</button>)}</div>
    <div className={styles.columns}>
      <section className={`${styles.panel} ${styles.conversation} ${view !== "conversation" ? styles.mobileHidden : ""}`} aria-label="Planning conversation">
        <div className={styles.panelHeader}><div><h2><MessageCircle size={17} />At the kitchen table</h2><p>A conversation with your calendar in view.</p></div><Leaf size={19} /></div>
        <div className={styles.messages} aria-live="polite">
          {!session.messages.length ? <div className={styles.welcome}><div className={styles.welcomeIcon}><Leaf size={22} /></div><h3>What does your week need?</h3><p>Start with an occasion, a favorite, or the vegetables you’d like to use. We’ll keep the plan and grocery implications together.</p><button disabled={busy} className={styles.prompt} onClick={() => void send("Only my Tuesday lunch is covered by work")}>Only my Tuesday lunch is covered by work <ArrowRight size={12} /></button><button disabled={busy} className={styles.prompt} onClick={() => void send("Find something from our favorites")}>Find something from our favorites <ArrowRight size={12} /></button><button disabled={busy} className={styles.prompt} onClick={() => void send("Try a new vegetable-focused recipe")}>Use the vegetables we brought home <ArrowRight size={12} /></button><button disabled={busy} className={styles.prompt} onClick={() => void send("Could one pasta batch cover three meals?")}>One pasta batch, three meals <ArrowRight size={12} /></button></div> : session.messages.map((message) => <div key={message.id} className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}><div className={styles.messageAuthor}>{message.id.startsWith("job-") && message.id.endsWith("-context") ? "Context refresh" : message.role === "user" ? planningUserMessageAuthor({ authorMemberId: message.authorMemberId, viewerMemberId: householdId ? currentMemberId : pilot.members[0]?.id, members: pilot.members, shared: Boolean(householdId) }) : message.source === "ai" ? message.id.startsWith("job-") ? "Local assistant" : "AI assistant" : "Planning helper · fixture"}</div><p>{message.text}</p>{message.recipes.map((recipe) => <button key={recipe.id} className={`${styles.quietButton} ${styles.messageRecipe}`} onClick={() => void focusRecipe(recipe)}><Utensils size={14} /><span>{session.rejectedRecipeIds.includes(recipe.id) ? `Reconsider ${recipe.name}` : recipe.name}</span><ArrowRight size={12} /></button>)}</div>)}
        </div>
        {assistantMode === "local" ? <LocalPlanningAssistant key={`${householdId}:${currentMemberId}:${session.id}`} householdId={householdId} actorMemberId={currentMemberId} revision={pilot.revision} session={session} contextFingerprint={planningRefreshFingerprint(state)} onResult={receiveLocalResult} requestRef={localAssistant} draft={draft} onDraftChange={setDraft} onDraftSubmitted={clearSubmittedDraft} storageError={storageError} /> : <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
          <div className={styles.focusPill}><CalendarDays size={12} />{dateLabel(focusDate, { weekday: "short", month: "short", day: "numeric" })} · {focusSlot}{focusedRecipe ? ` · ${focusedRecipe.name}` : " · choose a recipe"}</div>
          <label className="sr-only" htmlFor="planning-message">Message the planning helper</label><textarea id="planning-message" className={styles.textarea} placeholder="What would make this week easier?" maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className={styles.composerFooter}><span>{storageError ? "Draft is not saved" : "Draft saved on this device"}</span><button className={`${styles.quietButton} ${styles.primary}`} disabled={busy || !draft.trim()} type="submit"><Send size={14} />{busy ? "Saving…" : "Send"}</button></div>
        </form>}
        <SessionSettings session={session} members={pilot.members} onSave={setSession} />
        <MemberSettings state={state} run={run} />
      </section>

      <section className={`${styles.panel} ${view !== "calendar" ? styles.mobileHidden : ""}`} aria-label="Live meal calendar">
        <div className={styles.panelHeader}><div><h2><CalendarDays size={17} />Your live calendar</h2><p>{filled} of {target} person-meals covered · {target - filled} open</p></div><span className={styles.count}>{session.days}d</span></div>
        <div className={styles.calendarToolbar}><div className={styles.weekNav}><button className={styles.smallButton} aria-label="Previous week" onClick={() => void setSession({ startDate: addDays(session.startDate, -7) })}><ChevronLeft size={15} /></button><span className={styles.weekLabel}>{dateLabel(dates[0])} – {dateLabel(dates.at(-1)!)}</span><button className={styles.smallButton} aria-label="Next week" onClick={() => void setSession({ startDate: addDays(session.startDate, 7) })}><ChevronRight size={15} /></button></div><div className={styles.calendarLegend}><span><i className={styles.legendDot} />Planned or covered</span><span>○ Open for a person</span><span>Browsing keeps shopping dates</span></div></div>
        <div className={styles.calendar} style={{ "--slots": session.slots.length } as React.CSSProperties}>
          <div className={styles.calendarLabels} style={{ gridTemplateColumns: `38px repeat(${session.slots.length}, minmax(0, 1fr))` }}><span />{session.slots.map((slot) => <span key={slot}>{slot}</span>)}</div>
          {dates.map((date) => <div className={styles.day} key={date} style={{ gridTemplateColumns: `38px repeat(${session.slots.length}, minmax(0, 1fr))` }}><div className={styles.dayLabel}>{dateLabel(date, { weekday: "short" })}<strong>{dateLabel(date, { day: "numeric" })}</strong></div>{session.slots.map((slot) => {
            const coverage = getMealCoverage(state, date, slot).filter((entry) => session.memberIds.includes(entry.member.id));
            const batch = coverage.find((entry) => entry.batch)?.batch;
            const allCovered = coverage.every((entry) => entry.coverage || entry.allocation);
            return <button key={slot} aria-label={`${dateLabel(date, { weekday: "long", month: "short", day: "numeric" })} ${slot}`} aria-pressed={date === focusDate && slot === focusSlot} className={`${styles.occasion} ${allCovered ? styles.occasionFull : ""} ${date === focusDate && slot === focusSlot ? styles.occasionSelected : ""}`} onClick={() => void focusOccasion(date, slot)}><span className={styles.occasionTitle}>{batch?.recipe.name ?? (allCovered ? "Already covered" : "Make a little room")}</span>{coverage.map(({ member, allocation, coverage: cover }) => <span key={member.id} className={styles.person}><i className={`${styles.personDot} ${allocation || cover ? styles.personCovered : ""}`} />{member.name}: {allocation ? allocation.consumedAt ? "eaten" : `${allocation.portions} portion` : cover ? cover.reason === "eating-out" ? "eating out" : cover.reason === "work" ? "work lunch" : "covered" : "open"}</span>)}</button>;
          })}</div>)}
        </div>
        <div className={styles.occasionEditor}><h3>{dateLabel(focusDate, { weekday: "long", month: "short", day: "numeric" })} · {slotLabel(focusSlot)}</h3>{focusCoverage.map(({ member, allocation, coverage, batch }) => <div key={member.id} className={styles.memberRow}><div><span className={styles.memberName}>{member.name}</span><span className={styles.memberDetail}>{batch ? `${batch.recipe.name} · ${allocation?.portions} portion` : coverage ? coverage.reason === "eating-out" ? "Eating out" : "Already covered" : "An open meal"}</span></div><div className={styles.buttonRow}>{allocation ? <><button className={styles.smallButton} disabled={Boolean(allocation.consumedAt)} onClick={() => void run({ type: "remove_allocation", allocationId: allocation.id })}>Remove</button>{batch?.status === "cooked" && !allocation.consumedAt ? <><button className={styles.smallButton} onClick={() => void run({ type: "consume", allocationId: allocation.id })}>Eaten</button>{(pilot.prepared.find((entry) => entry.batchId === batch.id)?.freezerPortions ?? 0) >= allocation.portions ? <button className={styles.smallButton} onClick={() => void run({ type: "consume", allocationId: allocation.id, fromFreezer: true })}>Eaten from freezer</button> : null}</> : null}</> : coverage ? <button className={styles.smallButton} onClick={() => void run({ type: "clear_coverage", coverageId: coverage.id })}>Reopen</button> : <><button className={styles.smallButton} onClick={() => void run({ type: "set_coverage", coverage: { id: id(), memberId: member.id, date: focusDate, slot: focusSlot, reason: "work" } })}>Covered</button><button className={styles.smallButton} onClick={() => void run({ type: "set_coverage", coverage: { id: id(), memberId: member.id, date: focusDate, slot: focusSlot, reason: "eating-out" } })}>Eating out</button></>}</div></div>)}</div>
        {proposals.length ? <div className={styles.panelBody}>{proposals.map((proposal) => <ProposalReview key={proposal.id} proposal={proposal} state={state} run={run} focusRecipe={focusRecipe} />)}</div> : null}
        {appliedProposals.length ? <details className={styles.settings}>
          <summary>Past proposals · {appliedProposals.length}</summary>
          <p className={styles.formNotice}>Dismissing an applied proposal clears its review record. Its saved household changes remain.</p>
          {appliedProposals.map((proposal) => <div className={styles.proposal} key={proposal.id}><h3>{proposal.title}</h3><DismissProposal proposal={proposal} run={run} /></div>)}
        </details> : null}
      </section>

      <aside className={`${styles.context} ${view !== "context" ? styles.mobileHidden : ""}`} aria-label="Focused recipe and grocery preview">
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2><Utensils size={17} />On the table</h2><p>Explore first. Place when it fits.</p></div><span className={styles.count}>{session.candidates.length}</span></div>
          {session.candidates.length > 1 ? <div className={styles.panelBody}><div className={styles.recipeChooser}>{session.candidates.filter((recipe) => !session.rejectedRecipeIds.includes(recipe.id)).map((recipe) => <button className={`${styles.smallButton} ${recipe.id === focusedRecipe?.id ? styles.selectedChoice : ""}`} key={recipe.id} onClick={() => void focusRecipe(recipe)}>{recipe.name}</button>)}</div></div> : null}
          {focusedRecipe ? <><div className={styles.recipeHero}><span className={styles.recipeTag}>{focusedRecipe.provenance?.source === "import" ? "Your imported recipe" : focusedRecipe.provenance?.source === "ai" ? recipeIsSaved ? "Saved AI recipe" : "AI recipe candidate" : "Authored example · fixture"}</span><h3>{focusedRecipe.name}</h3><div className={styles.recipeMeta}><span><Clock3 size={12} />{focusedRecipe.minutes} min</span><span><Users size={12} />{focusedRecipe.servings} base portions</span></div></div><div className={styles.panelBody}><p className={styles.recipeDescription}>{focusedRecipe.description}</p><div className={styles.buttonRow}><button className={styles.smallButton} onClick={() => void send("Make this quicker")}>Less effort</button><button className={styles.smallButton} onClick={() => void send("Change the cuisine to Mediterranean")}>Try another cuisine</button><button className={styles.smallButton} disabled={recipeIsSaved} onClick={() => saveRecipe(focusedRecipe, focusedRecipe.provenance?.source ?? "demo")}><Bookmark size={12} />{recipeIsSaved ? "Saved" : "Save"}</button></div><CandidatePlacement key={`${focusedRecipe.id}:${focusDate}:${focusSlot}`} recipe={focusedRecipe} state={state} focusDate={focusDate} focusSlot={focusSlot} run={run} /><button className={`${styles.quietButton} ${styles.fullWidth}`} onClick={() => void proposeBatch()}><CalendarDays size={14} />Review a batch across 3 meals</button><RecipeDetail recipe={focusedRecipe} /><button className={styles.textButton} onClick={() => void rejectRecipe(focusedRecipe)}>Not this one</button></div></> : <div className={styles.empty}><Utensils size={28} /><h3>A good meal starts with an idea.</h3><p>Ask about your favorites or explore a vegetable-focused example. Selected cards stay connected to the conversation.</p><button className={styles.quietButton} onClick={() => void send("Try a vegetable-focused recipe")}><Leaf size={14} />Explore an example</button></div>}
        </section>
        {pilot.unplacedMeals.length ? <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Earlier undated meals</h2><p>Preserved from your previous plan. Choose a recipe to place it.</p></div></div><div className={styles.panelBody}>{pilot.unplacedMeals.map((meal) => <button key={meal.id} className={`${styles.quietButton} ${styles.messageRecipe}`} onClick={() => void focusRecipe(meal.recipe)}>{meal.recipe.name}<ArrowRight size={12} /></button>)}</div></section> : null}
        <ShoppingPreview state={state} run={run} compact />
      </aside>
    </div>
  </div>;
}

function ProposalReview({ proposal, state, run, focusRecipe }: { proposal: PlanningProposal; state: HouseholdState; run: RunCommand; focusRecipe: (recipe: Recipe) => Promise<void> }) {
  const { planningComposer, setProposalReview, storageError } = useHousehold();
  const review = readProposalReview(planningComposer.proposalReviews?.find((entry) => entry.proposalId === proposal.id), proposal);
  const excluded = review?.excludedAllocationIds ?? [];
  const includeOtherChanges = review?.includeOtherChanges ?? false;
  const saveChoice = (excludedAllocationIds: string[], otherChanges: boolean) => setProposalReview({ proposalId: proposal.id, fingerprint: proposalReviewFingerprint(proposal), excludedAllocationIds, includeOtherChanges: otherChanges });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const placements = proposal.changes.flatMap((change) => change.type === "create_batch" ? change.allocations : change.type === "allocate" ? [change.allocation] : []);
  const selectedAllocationIds = placements.filter((allocation) => !excluded.includes(allocation.id)).map((allocation) => allocation.id);
  const selected = new Set(selectedAllocationIds);
  const batches = proposal.changes.filter((change) => change.type === "create_batch");
  const otherChanges = proposal.changes.filter((change) => change.type !== "create_batch" && change.type !== "allocate");
  const reserveOnly = batches.filter((change) => change.batch.reservedExtra > 0 && !change.allocations.some((allocation) => selected.has(allocation.id)));
  const hasOtherChanges = otherChanges.length > 0 || reserveOnly.length > 0;
  const canApply = proposal.status === "pending" && !proposal.legacyMeals && (selected.size > 0 || (includeOtherChanges && hasOtherChanges));
  const person = (memberId: string) => state.pilot!.members.find((member) => member.id === memberId)?.name ?? memberId;
  async function apply() {
    if (!canApply || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try { await run({ type: "apply_proposal", proposalId: proposal.id, selectedAllocationIds, includeOtherChanges }); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function placementChoice(allocation: typeof placements[number]) {
    return <label className={styles.allocationChoice} key={allocation.id}><input type="checkbox" disabled={saving || proposal.status !== "pending"} checked={selected.has(allocation.id)} onChange={(event) => saveChoice(event.target.checked ? excluded.filter((entry) => entry !== allocation.id) : [...excluded, allocation.id], includeOtherChanges)} /><span>{person(allocation.memberId)} · {dateLabel(allocation.date)} {allocation.slot} · {allocation.portions} {allocation.portions === 1 ? "portion" : "portions"}</span></label>;
  }
  return <div className={styles.proposal}>
    <span className={styles.eyebrow}>{proposal.status === "stale" ? "NEEDS A FRESH REVIEW" : "REVIEW BEFORE APPLYING"}</span>
    <h3>{proposal.title}</h3>
    {proposal.legacyMeals?.length ? <p>Recovered earlier draft with {proposal.legacyMeals.length} meals. Open a recipe below, then choose its placement on the live calendar.</p> : null}
    {proposal.legacyMeals?.map((meal) => <button key={meal.id} className={`${styles.smallButton} ${styles.messageRecipe}`} onClick={() => void focusRecipe(meal.recipe)}>{meal.recipe.name}{meal.date ? ` · ${dateLabel(meal.date)} ${meal.slot}` : " · undated"}<ArrowRight size={12} /></button>)}
    {batches.map((change) => {
      const selectedPortions = change.allocations.filter((allocation) => selected.has(allocation.id)).reduce((total, allocation) => total + allocation.portions, 0);
      const included = selectedPortions > 0 || (includeOtherChanges && change.batch.reservedExtra > 0);
      return <div className={styles.proposalGroup} key={change.batch.id}>
        <strong>{change.batch.recipe.name}</strong>
        <p>Prepare {dateLabel(change.batch.prepareDate)} · {included ? `${selectedPortions + change.batch.reservedExtra} portions${change.batch.reservedExtra ? `, including ${change.batch.reservedExtra} reserved extra` : ""}` : "not included"} · one cooking batch</p>
        {change.allocations.map(placementChoice)}
      </div>;
    })}
    {proposal.changes.filter((change) => change.type === "allocate").map((change) => <div className={styles.proposalGroup} key={change.allocation.id}><strong>{state.pilot!.batches.find((batch) => batch.id === change.allocation.batchId)?.recipe.name ?? "Prepared food"}</strong>{placementChoice(change.allocation)}</div>)}
    {hasOtherChanges ? <div className={styles.proposalGroup}>
      <strong>Additional household changes</strong>
      <ul>{otherChanges.map((change, index) => <li key={index}>{describeChange(change, state)}</li>)}{reserveOnly.map((change) => <li key={change.batch.id}>Prepare {change.batch.reservedExtra} reserved extra portions of {change.batch.recipe.name} on {dateLabel(change.batch.prepareDate)}, with no calendar placements.</li>)}</ul>
      <label className={styles.allocationChoice}><input type="checkbox" checked={includeOtherChanges} disabled={saving || proposal.status !== "pending"} onChange={(event) => saveChoice(excluded, event.target.checked)} />Include these additional changes</label>
    </div> : null}
    {placements.length ? <p className={styles.formNotice}>{selected.size} of {placements.length} person-meal placements selected. Unselected placements are not applied. Batch ingredients update for the accepted portions.</p> : null}
    {proposal.status === "pending" && !proposal.legacyMeals ? <p className={styles.formNotice}>{storageError ? "Review choices are not saved. Keep this page open." : "Review choices are saved on this device until this proposal changes."}</p> : null}
    <div className={styles.buttonRow}>
      <button className={`${styles.quietButton} ${styles.primary}`} disabled={saving || !canApply} onClick={() => void apply()}><Check size={14} />{saving ? "Applying…" : selected.size ? "Apply selected placements" : "Apply selected changes"}</button>
      <DismissProposal proposal={proposal} run={run} />
    </div>
    {proposal.status === "stale" ? <p className={styles.formNotice}>Household context changed. Ask for a new proposal to review current gaps, or dismiss this suggestion.</p> : null}
  </div>;
}

function DismissProposal({ proposal, run }: { proposal: { id: string; title: string }; run: RunCommand }) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function dismiss() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try { await run({ type: "dismiss_proposal", proposalId: proposal.id }); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <button className={styles.smallButton} aria-label={`Dismiss proposal: ${proposal.title}`} disabled={saving} onClick={() => void dismiss()}>{saving ? "Dismissing…" : "Dismiss"}</button>;
}

function sessionFormValues(session: PlanningSession) {
  return { startDate: session.startDate, days: session.days, slots: session.slots, memberIds: session.memberIds, constraints: session.constraints, equipment: session.equipment.join(", ") };
}

function SessionSettings({ session, members, onSave }: { session: PlanningSession; members: {id: string; name: string}[]; onSave: (patch: Partial<PlanningSession>) => Promise<boolean> }) {
  const incoming = sessionFormValues(session);
  const [form, setForm] = useState(() => createSettingsDraft(incoming));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const resolved = resolveSettingsDraft(form, incoming);
  if (resolved.draft !== form) setForm(resolved.draft);
  const values = resolved.draft.values;
  const conflict = resolved.conflict;
  const update = (patch: Partial<typeof values>) => setForm((current) => ({ ...current, values: { ...current.values, ...patch } }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (conflict || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const equipment = values.equipment.split(",").map((value) => value.trim()).filter(Boolean);
    const normalized = { ...values, equipment: equipment.join(", ") };
    try {
      if (await onSave({ ...values, equipment })) setForm(createSettingsDraft(normalized));
    } finally { savingRef.current = false; setSaving(false); }
  }
  return <details className={styles.settings}>
    <summary>Session preferences & equipment</summary>
    {conflict ? <div className={styles.notice} role="alert"><p>The household’s session settings changed while you were editing. Your draft is kept below. Load the current settings before saving another change.</p><button className={styles.smallButton} type="button" onClick={() => setForm(createSettingsDraft(incoming))}>Load current settings</button></div> : null}
    <form onSubmit={(event) => void save(event)}><fieldset className={styles.settingsFields} disabled={saving}>
      <label className={styles.field}>Calendar starts<input className={styles.input} type="date" required value={values.startDate} onChange={(event) => update({ startDate: event.target.value })} /></label>
      <div className={styles.buttonRow}>{members.map((member) => <label className={styles.allocationChoice} key={member.id}><input type="checkbox" checked={values.memberIds.includes(member.id)} onChange={(event) => update({ memberIds: event.target.checked ? [...values.memberIds, member.id] : values.memberIds.filter((memberId) => memberId !== member.id) })} />{member.name}</label>)}</div>
      <label className={styles.field}>What matters this week<textarea className={styles.textarea} value={values.constraints} onChange={(event) => update({ constraints: event.target.value })} maxLength={2000} placeholder="Vegetable-heavy lunches, less than 30 minutes…" /></label>
      <label className={styles.field}>Available equipment<input className={styles.input} value={values.equipment} onChange={(event) => update({ equipment: event.target.value })} placeholder="Oven, skillet, rice cooker" /></label>
      <label className={styles.field}>Visible days<select className={styles.select} value={values.days} onChange={(event) => update({ days: Number(event.target.value) })}>{[...new Set([7, 14, 21, 28, values.days])].sort((left, right) => left - right).map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>
      <div className={styles.buttonRow}>{slotOptions.map((slot) => <label key={slot} className={styles.allocationChoice}><input type="checkbox" checked={values.slots.includes(slot)} onChange={(event) => update({ slots: event.target.checked ? slotOptions.filter((entry) => entry === slot || values.slots.includes(entry)) : values.slots.filter((entry) => entry !== slot) })} />{slotLabel(slot)}</label>)}</div>
      <button className={styles.quietButton} type="submit" disabled={conflict || !values.memberIds.length || !values.slots.length}>{saving ? "Saving…" : "Save session preferences"}</button>
      <p className={styles.formNotice}>These preferences are saved as context for the next request. They do not claim dietary screening.</p>
    </fieldset></form>
  </details>;
}

function CandidatePlacement({ recipe, state, focusDate, focusSlot, run }: { recipe: Recipe; state: HouseholdState; focusDate: string; focusSlot: MealSlot; run: RunCommand }) {
  const [extra, setExtra] = useState(0);
  const [prepareDate, setPrepareDate] = useState(focusDate);
  const openMembers = getMealCoverage(state, focusDate, focusSlot).filter((entry) => state.pilot!.session.memberIds.includes(entry.member.id) && !entry.coverage && !entry.allocation);
  // A newly reopened person is selected by default. Store explicit exclusions,
  // rather than a one-time snapshot that becomes stale after removing a meal.
  const [excluded, setExcluded] = useState<string[]>([]);
  const selected = openMembers.filter((entry) => !excluded.includes(entry.member.id)).map((entry) => entry.member.id);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function place(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const batchId = id();
    try {
      await run({ type: "create_batch", batch: { id: batchId, recipe, prepareDate, yield: selected.length + extra, reservedExtra: extra }, allocations: selected.map((memberId) => ({ id: id(), batchId, memberId, date: focusDate, slot: focusSlot, portions: 1 })) });
    } finally { savingRef.current = false; setSaving(false); }
  }
  return <form className={styles.details} onSubmit={(event) => void place(event)}><p className={styles.subtle}>Place on <strong>{dateLabel(focusDate)} · {focusSlot}</strong></p>{openMembers.length ? openMembers.map(({ member }) => <label className={styles.allocationChoice} key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={(event) => setExcluded(event.target.checked ? excluded.filter((memberId) => memberId !== member.id) : [...excluded, member.id])} />{member.name} · 1 portion</label>) : <p className={styles.subtle}>Everyone is covered. Select an open occasion or prepare extra portions.</p>}<div className={styles.fieldRow}><label className={styles.field}>Prepare on<input className={styles.input} type="date" value={prepareDate} max={focusDate} required onChange={(event) => setPrepareDate(event.target.value)} /></label><label className={styles.field}>Reserve extra portions<input className={styles.input} type="number" min={0} max={30} step={1} value={extra} onChange={(event) => setExtra(Number(event.target.value))} /></label></div><CandidateGroceries state={state} recipe={recipe} portions={selected.length + extra} prepareDate={prepareDate} /><button className={`${styles.quietButton} ${styles.primary} ${styles.fullWidth}`} disabled={saving || (!selected.length && !extra)} type="submit"><Plus size={14} />{saving ? "Saving…" : `Plan ${selected.length + extra} ${selected.length + extra === 1 ? "portion" : "portions"}`}</button><p className={styles.formNotice}>Ingredients counted once for this batch. Pantry changes only when you record cooking.</p></form>;
}

function CandidateGroceries({ state, recipe, portions, prepareDate }: { state: HouseholdState; recipe: Recipe; portions: number; prepareDate: string }) {
  if (!Number.isFinite(portions) || portions <= 0 || portions > 1000 || !calendarDateSchema.safeParse(prepareDate).success) return <p className={styles.formNotice}>Choose a preparation date and people or extra portions to preview this recipe’s grocery needs.</p>;
  const preview = previewCandidateShopping(state, recipe, portions, prepareDate);
  return <section className={styles.candidatePreview} aria-label="Candidate grocery preview">
    <h4>Extra groceries for this candidate</h4>
    <p>If you plan {portions} {portions === 1 ? "portion" : "portions"}, including reserved extras. Existing cooking plans through {dateLabel(preview.shopThrough)} are counted first.</p>
    {preview.extendsShoppingHorizon ? <p className={styles.formNotice}>This preview looks through the preparation date. Your saved shopping date stays {dateLabel(state.pilot!.shopThrough)}.</p> : null}
    {preview.shortages.length ? <ul className={styles.ingredients}>{preview.shortages.map((item) => <li key={`${item.ingredientId}:${item.unit}`}><span>{item.name}</span><strong>+{amount(item.quantity, item.unit)}</strong></li>)}</ul> : <p>No additional calculated shortages.</p>}
    {preview.checks.length ? <><strong className={styles.checkBadge}>Stock checks · amounts uncertain</strong><ul className={styles.candidateChecks}>{preview.checks.map((item) => <li key={`${item.ingredientId}:${item.unit}`}><strong>{item.name}</strong><span>Check for {amount(item.required, item.unit)} in total; {amount(item.candidateRequired, item.unit)} is for this candidate.</span></li>)}</ul></> : null}
    <p className={styles.formNotice}>Preview only. Your live groceries change when you plan the batch.</p>
  </section>;
}

function MemberSettings({ state, run }: { state: HouseholdState; run: RunCommand }) {
  const incoming = state.pilot!.members.map((member) => ({ ...member, preferences: member.preferences ?? "" }));
  const [form, setForm] = useState(() => createSettingsDraft(incoming));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const resolved = resolveSettingsDraft(form, incoming);
  if (resolved.draft !== form) setForm(resolved.draft);
  const members = resolved.draft.values;
  const update = (memberId: string, patch: { name?: string; preferences?: string }) => setForm((current) => ({ ...current, values: current.values.map((member) => member.id === memberId ? { ...member, ...patch } : member) }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (resolved.conflict || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { if (await run({ type: "set_members", members })) setForm(createSettingsDraft(members)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <details className={styles.settings}>
    <summary>People & individual preferences</summary>
    {resolved.conflict ? <div className={styles.notice} role="alert"><p>The household’s people or preferences changed while you were editing. Your draft is kept below. Load the current people before saving another change.</p><button className={styles.smallButton} type="button" onClick={() => setForm(createSettingsDraft(incoming))}>Load current people</button></div> : null}
    <form onSubmit={(event) => void save(event)}><fieldset className={styles.settingsFields} disabled={saving}>
      {members.map((member) => <div key={member.id}><label className={styles.field}>Name<input className={styles.input} required maxLength={80} value={member.name} onChange={(event) => update(member.id, { name: event.target.value })} /></label><label className={styles.field}>{member.name || "This person"}’s food preferences<textarea className={styles.textarea} maxLength={2000} value={member.preferences} onChange={(event) => update(member.id, { preferences: event.target.value })} placeholder="Favorite flavors, practical food goals, foods to avoid…" /></label></div>)}
      <button className={styles.quietButton} disabled={resolved.conflict}>{saving ? "Saving…" : "Save household people"}</button>
    </fieldset></form>
  </details>;
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  return <details className={styles.details}><summary>Ingredients & steps · {recipe.servings} portions</summary><ul className={styles.ingredients}>{recipe.ingredients.map((ingredient, index) => <li key={`${ingredient.ingredientId}:${ingredient.unit}:${index}`}><span>{ingredient.name}</span><span>{amount(ingredient.quantity, ingredient.unit)}</span></li>)}</ul><ol className={styles.steps}>{recipe.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>{recipe.provenance?.sourceUrl ? <a className={styles.textButton} href={recipe.provenance.sourceUrl} target="_blank" rel="noreferrer">Original recipe</a> : null}</details>;
}

function ShoppingPreview({ state, run, compact = false }: { state: HouseholdState; run: RunCommand; compact?: boolean }) {
  const shopping = buildPilotShoppingList(state);
  return <section className={styles.panel} aria-label={compact ? "Grocery preview" : "Shopping needs"}><div className={styles.panelHeader}><div><h2><ShoppingBasket size={17} />{compact ? "Grocery preview" : "What to bring home"}</h2><p>{shopping.batches.length} upcoming cooking {shopping.batches.length === 1 ? "batch" : "batches"} · ingredients counted once</p></div><span className={styles.count}>{shopping.shortages.length + shopping.checks.filter((check) => !check.resolved).length}</span></div><div className={styles.panelBody}><label className={styles.field}>Shop for cooking through<input className={styles.input} aria-label="Shop through date" type="date" value={state.pilot!.shopThrough} onChange={(event) => { if (event.target.value) void run({ type: "set_shop_through", date: event.target.value }); }} /></label><p className={styles.subtle}>Includes batches prepared by this date, even when their portions are for later.</p>{!shopping.shortages.length && !shopping.checks.length ? <div className={styles.empty}><CheckCheck size={24} /><h3>{shopping.batches.length ? "Your known stock covers the plan." : "A little room to plan."}</h3><p>{shopping.batches.length ? "No calculated shortages for this shopping window." : "Place a cooking batch to see what you’ll need."}</p></div> : <><ul className={styles.shoppingList}>{shopping.shortages.map((item) => compact ? <li className={styles.shoppingItem} key={`${item.ingredientId}:${item.unit}`}><div><strong>{item.name}</strong><small>{amount(item.available, item.unit)} known stock</small></div><strong>{amount(item.quantity, item.unit)}</strong></li> : <PurchaseItem key={`${item.ingredientId}:${item.unit}:${item.quantity}`} item={item} run={run} />)}{shopping.checks.map((check) => <li className={styles.shoppingItem} key={`${check.ingredientId}:${check.unit}`}><div><strong>{check.name}</strong><small>Need {amount(check.required, check.unit)} · {amount(check.knownAvailable, check.unit)} known stock{check.packageStock.length ? ` · ${amount(check.knownRemainder, check.unit)} unverified need` : " · quantity uncertain"}</small>{check.packageStock.length ? <small>{check.packageStock.map(packageStockLabel).join(", ")} · contents unresolved</small> : null}<span className={styles.checkBadge}>{check.resolved ? "Confirmed for this requirement" : "Stock check"}</span></div>{!check.resolved ? <button className={styles.smallButton} onClick={() => void run({ type: "confirm_stock", ingredientId: check.ingredientId, unit: check.unit, fingerprint: check.fingerprint })}>We have enough</button> : <Check size={16} />}</li>)}</ul>{shopping.checks.length ? <p className={styles.formNotice}>Confirming sufficiency does not invent a pantry amount. Changes to requirements or stock reopen the check. Unverified need is not a definite quantity to buy.</p> : null}</>}{compact ? <Link className={`${styles.quietButton} ${styles.fullWidth}`} href="/shopping">Shopping, cooking & leftovers <ArrowRight size={13} /></Link> : null}</div></section>;
}

function PurchaseItem({ item, run }: { item: ShoppingItem; run: RunCommand }) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  return <li className={styles.purchaseItem}><form onSubmit={async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    const details = purchaseDetails(new FormData(event.currentTarget));
    savingRef.current = true; setSaving(true);
    try { await run({ type: "record_purchase", items: [{ ingredientId: item.ingredientId, name: item.name, unit: item.unit, quantity, ...details }] }); }
    finally { savingRef.current = false; setSaving(false); }
  }}><fieldset className={styles.settingsFields} disabled={saving}><div className={styles.shoppingItem}><div><strong>{item.name}</strong><small>Need {amount(item.quantity, item.unit)} more</small></div><div className={styles.purchaseRow}><label><span className="sr-only">Purchased {item.name}, {item.unit}</span><input className={styles.input} type="number" min={0.01} max={100000} step="any" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><button className={styles.smallButton} type="submit" disabled={quantity <= 0}>{saving ? "Saving…" : "Bought"}</button></div></div><PurchaseDetailsFields /></fieldset></form></li>;
}

export function PilotShoppingPanel() {
  const { state, dispatchPilot } = useHousehold();
  const [notice, setNotice] = useState<string | null>(null);
  const pilot = state.pilot!;
  const latestReceipt = [...pilot.receipts].reverse().find((receipt) => receipt.operationType !== "set_session" && (receipt.operationType !== "receive_planning_result" || Boolean(receipt.inverse)));
  const run: RunCommand = async (operation) => {
    setNotice(null);
    try { const result = await dispatchPilot(operation); if (!result.ok) setNotice(result.error ?? "The change could not be saved."); return result.ok; }
    catch { setNotice("The change could not be saved. Check your connection and try again."); return false; }
  };
  return <div className={styles.workspace}><header className={styles.heading}><div><span className={styles.eyebrow}>FROM A GOOD PLAN TO A GOOD MEAL</span><h1>Shop once. Cook with a plan.</h1><p>Bring food home, record what you cook, and give the extra portions somewhere to go.</p></div><Link href="/meals" className={styles.quietButton}><ArrowLeft size={14} />Back to planning</Link></header>{notice ? <p className={styles.notice} role="alert">{notice}</p> : null}{latestReceipt ? <div className={styles.receipt} role="status"><span><Check size={16} />{latestReceipt.summary}</span>{latestReceipt.inverse && !latestReceipt.undoneBy ? <button className={styles.smallButton} onClick={() => void run({ type: "undo", receiptId: latestReceipt.id })}><Undo2 size={13} />Undo</button> : null}</div> : null}<div className={styles.shoppingLayout}><div className={styles.context}><ShoppingPreview state={state} run={run} /><StockEditor state={state} run={run} /></div><section className={styles.panel} aria-label="Cooking and prepared food"><div className={styles.panelHeader}><div><h2><CookingPot size={18} />Cook once, enjoy again</h2><p>Food is only cooked or eaten when you record it.</p></div><span className={styles.count}>{pilot.batches.length}</span></div><div className={styles.panelBody}>{pilot.batches.length ? pilot.batches.map((batch) => <BatchControls key={`${batch.id}:${batch.yield}:${batch.status}`} batch={batch} state={state} run={run} />) : <div className={styles.empty}><CookingPot size={26} /><h3>Your next batch starts in the calendar.</h3><p>Plan a recipe and its portions, then return here when you’re ready to cook.</p><Link className={styles.quietButton} href="/meals">Plan a meal <ArrowRight size={13} /></Link></div>}</div></section></div></div>;
}

function StockEditor({ state, run }: { state: HouseholdState; run: RunCommand }) {
  const [ingredientKey, setIngredientKey] = useState(state.pantry[0] ? `${state.pantry[0].id}:${state.pantry[0].unit}` : "");
  const ingredient = state.pantry.find((item) => `${item.id}:${item.unit}` === ingredientKey);
  return <section className={styles.panel}><div className={styles.panelHeader}><div><h2><Leaf size={17} />What’s actually in the kitchen?</h2><p>“Some” is useful. A made-up quantity isn’t.</p></div></div><div className={styles.panelBody}>{state.pantry.length ? <><label className={styles.field}>Ingredient<select className={styles.select} value={ingredientKey} onChange={(event) => setIngredientKey(event.target.value)}>{state.pantry.map((item) => <option key={`${item.id}:${item.unit}`} value={`${item.id}:${item.unit}`}>{item.name} ({item.unit})</option>)}</select></label>{ingredient ? <><StockForm key={`stock:${ingredient.id}:${ingredient.unit}`} state={state} ingredient={ingredient} run={run} /><StockPurchaseForm key={`purchase:${ingredient.id}:${ingredient.unit}`} ingredient={ingredient} run={run} /><PurchaseHistory state={state} ingredient={ingredient} /></> : null}</> : <p className={styles.subtle}>Add ingredients in <Link href="/pantry">your pantry</Link> first.</p>}</div></section>;
}

function StockForm({ state, ingredient, run }: { state: HouseholdState; ingredient: HouseholdState["pantry"][number]; run: RunCommand }) {
  const stock = state.pilot!.stock.find((item) => item.ingredientId === ingredient.id && item.unit === ingredient.unit);
  const incoming = { status: stock?.status ?? "exact" as const, quantity: stock?.status === "some" || stock?.status === "low" ? "" : String(stock?.quantity ?? ingredient.quantity), sourceNote: stock?.sourceNote ?? "", useSoon: stock?.useSoon ?? ingredient.useSoon, purchasedOn: stock?.purchasedOn ?? "", bestBefore: stock?.bestBefore ?? "" };
  const [form, setForm] = useState(() => createSettingsDraft(incoming));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const resolved = resolveSettingsDraft(form, incoming);
  if (resolved.draft !== form) setForm(resolved.draft);
  const values = resolved.draft.values;
  const update = (patch: Partial<typeof values>) => setForm((current) => ({ ...current, values: { ...current.values, ...patch } }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (resolved.conflict || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      if (await run({ type: "set_stock", stock: { ingredientId: ingredient.id, name: ingredient.name, unit: ingredient.unit, status: values.status, ...(values.status === "exact" ? { quantity: Number(values.quantity) } : {}), sourceNote: values.sourceNote, useSoon: values.useSoon, ...(values.purchasedOn ? { purchasedOn: values.purchasedOn } : {}), ...(values.bestBefore ? { bestBefore: values.bestBefore } : {}) } })) setForm(createSettingsDraft(values));
    } finally { savingRef.current = false; setSaving(false); }
  }
  return <>
    {resolved.conflict ? <div className={styles.notice} role="alert"><p>This ingredient changed while you were editing. Your draft is kept below.</p><button type="button" className={styles.smallButton} onClick={() => setForm(createSettingsDraft(incoming))}>Load current stock</button></div> : null}
    <form onSubmit={(event) => void save(event)}><fieldset className={styles.settingsFields} disabled={saving}>
      <div className={styles.fieldRow}><label className={styles.field}>Stock state<select className={styles.select} value={values.status} onChange={(event) => update({ status: event.target.value as typeof values.status, ...(event.target.value === "exact" && (values.status === "some" || values.status === "low") ? { quantity: "" } : {}) })}><option value="exact">Exact quantity</option><option value="some">Some</option><option value="low">Running low</option><option value="out">Out</option></select></label>{values.status === "exact" ? <label className={styles.field}>Amount ({ingredient.unit})<input className={styles.input} type="number" min={0} max={100000} step="any" required placeholder="Measured total" value={values.quantity} onChange={(event) => update({ quantity: event.target.value })} /></label> : <p className={styles.subtle}>No numerical balance will be invented.</p>}</div>
      <label className={styles.field}>Farm, source, or storage note<input className={styles.input} value={values.sourceNote} onChange={(event) => update({ sourceNote: event.target.value })} maxLength={1000} placeholder="Saturday farm box" /></label>
      <div className={styles.fieldRow}><label className={styles.field}>Purchased on (optional)<input className={styles.input} type="date" value={values.purchasedOn} onChange={(event) => update({ purchasedOn: event.target.value })} /></label><label className={styles.field}>Best before (optional)<input className={styles.input} type="date" value={values.bestBefore} onChange={(event) => update({ bestBefore: event.target.value })} /></label></div>
      <label className={styles.allocationChoice}><input type="checkbox" checked={values.useSoon} onChange={(event) => update({ useSoon: event.target.checked })} />Use soon</label><button className={styles.quietButton} disabled={resolved.conflict}>{saving ? "Saving…" : "Update kitchen stock"}</button>
    </fieldset></form>
  </>;
}

function BatchControls({ batch, state, run }: { batch: CookingBatch; state: HouseholdState; run: RunCommand }) {
  const { currentMemberId } = useHousehold();
  const pilot = state.pilot!;
  const feedbackMemberId = currentMemberId ?? pilot.members[0].id;
  const prepared = pilot.prepared.find((entry) => entry.batchId === batch.id);
  const allocations = pilot.allocations.filter((entry) => entry.batchId === batch.id);
  const [actual, setActual] = useState(batch.yield);
  const [freezer, setFreezer] = useState(batch.reservedExtra);
  const [saving, setSaving] = useState(false);
  const [laterDate, setLaterDate] = useState(addDays(batch.prepareDate, 7));
  const [laterSlot, setLaterSlot] = useState<MealSlot>("lunch");
  const [memberId, setMemberId] = useState(pilot.members[0].id);
  const feedback = [...pilot.feedback].reverse().find((entry) => entry.recipeId === batch.recipe.id && entry.memberId === feedbackMemberId);
  const [rating, setRating] = useState(feedback?.rating ?? 4);
  const available = prepared ? prepared.produced - prepared.consumed : 0;
  const unallocated = available - allocations.filter((entry) => !entry.consumedAt).reduce((sum, entry) => sum + entry.portions, 0);
  return <article className={styles.batchCard}><div className={styles.batchStatus}><span>{dateLabel(batch.prepareDate)} · preparation</span><span>{batch.status === "cooked" ? "Cooked" : "Planned"}</span></div><h3>{batch.recipe.name}</h3><p>{batch.status === "cooked" ? `${available} portions remain · ${prepared?.freezerPortions ?? 0} in freezer · ${Math.max(0, unallocated)} unallocated` : `${batch.yield} intended portions · ${batch.reservedExtra} reserved extra · ingredients counted once`}</p>{batch.status === "planned" ? <><form onSubmit={async (event) => { event.preventDefault(); if (saving) return; setSaving(true); await run({ type: "cook_batch", batchId: batch.id, actualPortions: actual, freezerPortions: freezer }); setSaving(false); }}><div className={styles.fieldRow}><label className={styles.field}>Actual portions made<input className={styles.input} type="number" min={1} max={1000} step="any" value={actual} onChange={(event) => setActual(Number(event.target.value))} /></label><label className={styles.field}>Put in the freezer<input className={styles.input} type="number" min={0} max={actual} step="any" value={freezer} onChange={(event) => setFreezer(Number(event.target.value))} /></label></div><div className={styles.buttonRow}><button className={`${styles.quietButton} ${styles.primary}`} disabled={saving} type="submit"><CookingPot size={14} />{saving ? "Saving…" : "Confirm cooked"}</button><button className={styles.smallButton} type="button" onClick={() => void run({ type: "remove_batch", batchId: batch.id })}>Cancel batch</button></div></form><p className={styles.formNotice}>Cooking records ingredient use. Purchases stay in inventory if you cancel a batch.</p></> : <>{unallocated > 0 ? <details className={styles.details}><summary><Snowflake size={12} /> Schedule prepared portions later</summary><form onSubmit={(event) => { event.preventDefault(); void run({ type: "allocate", allocation: { id: id(), batchId: batch.id, memberId, date: laterDate, slot: laterSlot, portions: 1 } }); }}><div className={styles.fieldRow}><label className={styles.field}>Date<input className={styles.input} type="date" required min={batch.prepareDate} value={laterDate} onChange={(event) => setLaterDate(event.target.value)} /></label><label className={styles.field}>Meal<select className={styles.select} value={laterSlot} onChange={(event) => setLaterSlot(event.target.value as MealSlot)}>{slotOptions.map((slot) => <option key={slot} value={slot}>{slotLabel(slot)}</option>)}</select></label></div><label className={styles.field}>Person<select className={styles.select} value={memberId} onChange={(event) => setMemberId(event.target.value)}>{pilot.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><button className={styles.quietButton}>Schedule 1 prepared portion</button><p className={styles.formNotice}>Scheduling reserves a portion. Mark it eaten to reduce prepared food.</p></form></details> : null}{allocations.filter((entry) => !entry.consumedAt).map((allocation) => <div className={styles.shoppingItem} key={allocation.id}><div><strong>{pilot.members.find((member) => member.id === allocation.memberId)?.name}</strong><small>{dateLabel(allocation.date)} · {allocation.slot} · {allocation.portions} portion</small></div><div className={styles.buttonRow}><button className={styles.smallButton} onClick={() => void run({ type: "consume", allocationId: allocation.id })}>Eaten</button>{(prepared?.freezerPortions ?? 0) >= allocation.portions ? <button className={styles.smallButton} onClick={() => void run({ type: "consume", allocationId: allocation.id, fromFreezer: true })}>Eaten from freezer</button> : null}</div></div>)}</>}
    {batch.status === "cooked" && prepared ? <PreparedCorrection batch={batch} state={state} prepared={prepared} run={run} /> : null}
    <details className={styles.details}><summary>Rate this recipe & leave a cooking note</summary>{feedback ? <p className={styles.formNotice}>Saved: {feedback.rating}/5 · {feedback.makeAgain ? "make again" : "not a repeat"}{feedback.notes ? ` · ${feedback.notes}` : ""}</p> : null}<form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run({ type: "record_feedback", feedback: { id: id(), memberId: feedbackMemberId, recipeId: batch.recipe.id, rating, makeAgain: data.get("again") === "on", notes: String(data.get("notes") ?? "") } }); }}><div className={styles.rating} role="group" aria-label="Recipe rating">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value} stars`} aria-pressed={value === rating} onClick={() => setRating(value)}><Star size={20} fill={value <= rating ? "currentColor" : "none"} /></button>)}</div><label className={styles.allocationChoice}><input type="checkbox" name="again" defaultChecked={feedback?.makeAgain ?? true} />Make again</label><label className={styles.field}>Cooking note<textarea className={styles.textarea} name="notes" maxLength={2000} defaultValue={feedback?.notes ?? ""} placeholder="What worked? What would you change next time?" /></label><button className={styles.quietButton}>Save feedback</button></form></details>
  </article>;
}

function PreparedCorrection({ batch, state, prepared, run }: { batch: CookingBatch; state: HouseholdState; prepared: PreparedPortions; run: RunCommand }) {
  const incoming = {
    produced: prepared.produced, freezerPortions: prepared.freezerPortions, consumed: prepared.consumed,
    reopenAllocationIds: [] as string[], reason: "",
    meals: state.pilot!.allocations.filter((allocation) => allocation.batchId === batch.id).map(({ id, memberId, date, slot, portions, consumedAt }) => ({ id, memberId, date, slot, portions, consumedAt })).sort((left, right) => left.id.localeCompare(right.id)),
  };
  const [form, setForm] = useState(() => createSettingsDraft(incoming));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const resolved = resolveSettingsDraft(form, incoming);
  if (resolved.draft !== form) setForm(resolved.draft);
  const values = resolved.draft.values;
  const update = (patch: Partial<typeof values>) => setForm((current) => ({ ...current, values: { ...current.values, ...patch } }));
  const reopened = new Set(values.reopenAllocationIds);
  const reopenedPortions = values.meals.filter((meal) => reopened.has(meal.id)).reduce((sum, meal) => sum + meal.portions, 0);
  const consumed = values.consumed - reopenedPortions;
  const remaining = values.produced - consumed;
  const planned = values.meals.filter((meal) => !meal.consumedAt || reopened.has(meal.id)).reduce((sum, meal) => sum + meal.portions, 0);
  const validBalance = Number.isFinite(values.produced) && Number.isFinite(values.freezerPortions) && values.produced >= 0 && values.produced <= 1000 && remaining >= planned && values.freezerPortions >= 0 && values.freezerPortions <= remaining;
  async function correct(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || resolved.conflict || !validBalance || !values.reason.trim()) return;
    savingRef.current = true; setSaving(true);
    try {
      if (await run({ type: "correct_prepared", batchId: batch.id, produced: values.produced, freezerPortions: values.freezerPortions, reopenAllocationIds: values.reopenAllocationIds, reason: values.reason })) setForm(createSettingsDraft({ ...values, reopenAllocationIds: [], reason: "" }));
    } finally { savingRef.current = false; setSaving(false); }
  }
  return <details className={styles.details}>
    <summary>Correct prepared food or an eaten meal</summary>
    <p>Enter the total portions actually made and how many remain in the freezer now. Reopen only meals mistakenly marked eaten.</p>
    {resolved.conflict ? <div className={styles.notice} role="alert"><p>This batch’s portions or meals changed while you were editing. Your draft is kept below. Load current portions before correcting it.</p><button type="button" className={styles.smallButton} onClick={() => setForm(createSettingsDraft(incoming))}>Load current portions</button></div> : null}
    <form onSubmit={(event) => void correct(event)}><fieldset className={styles.settingsFields} disabled={saving}>
      <div className={styles.fieldRow}><label className={styles.field}>Total portions actually made<input className={styles.input} type="number" min={0} max={1000} step="any" required value={values.produced} onChange={(event) => update({ produced: Number(event.target.value) })} /></label><label className={styles.field}>Portions in freezer now<input className={styles.input} type="number" min={0} max={1000} step="any" required value={values.freezerPortions} onChange={(event) => update({ freezerPortions: Number(event.target.value) })} /></label></div>
      {values.meals.some((meal) => meal.consumedAt) ? <div><p>Meals to mark uneaten again</p>{values.meals.filter((meal) => meal.consumedAt).map((meal) => <label className={styles.allocationChoice} key={meal.id}><input type="checkbox" checked={reopened.has(meal.id)} onChange={(event) => update({ reopenAllocationIds: event.target.checked ? [...values.reopenAllocationIds, meal.id] : values.reopenAllocationIds.filter((entry) => entry !== meal.id) })} /><span>{state.pilot!.members.find((member) => member.id === meal.memberId)?.name ?? "Household member"} · {dateLabel(meal.date)} {meal.slot} · {meal.portions} {meal.portions === 1 ? "portion" : "portions"}</span></label>)}</div> : null}
      <p className={styles.formNotice}>{validBalance ? `After correction: ${remaining} portions remain, including ${values.freezerPortions} in the freezer; ${planned} reserved for meals.` : "The total must cover eaten and reserved meals, and freezer portions cannot exceed the remaining food."}</p>
      <label className={styles.field}>Reason for correction<textarea className={styles.textarea} required maxLength={1000} value={values.reason} onChange={(event) => update({ reason: event.target.value })} placeholder="For example, one lunch was marked eaten by mistake." /></label>
      <button className={styles.quietButton} disabled={resolved.conflict || !validBalance || !values.reason.trim()}>{saving ? "Saving…" : "Save prepared-food correction"}</button>
      <p className={styles.formNotice}>Recorded ingredient use stays unchanged. Correct pantry stock separately if needed. The saved correction offers Undo.</p>
    </fieldset></form>
  </details>;
}

function purchaseDetails(data: FormData): Partial<Pick<PurchasedIngredient, "purchasedOn" | "bestBefore" | "sourceNote" | "lotCode">> {
  const purchasedOn = String(data.get("purchasedOn") ?? "");
  const bestBefore = String(data.get("bestBefore") ?? "");
  const sourceNote = String(data.get("sourceNote") ?? "").trim();
  const lotCode = String(data.get("lotCode") ?? "").trim();
  return { ...(purchasedOn ? { purchasedOn } : {}), ...(bestBefore ? { bestBefore } : {}), ...(sourceNote ? { sourceNote } : {}), ...(lotCode ? { lotCode } : {}) };
}

function PurchaseDetailsFields() {
  return <details className={styles.details}><summary>Purchase details (optional)</summary>
    <div className={styles.fieldRow}><label className={styles.field}>Purchased on<input className={styles.input} type="date" name="purchasedOn" /></label><label className={styles.field}>Best before<input className={styles.input} type="date" name="bestBefore" /></label></div>
    <label className={styles.field}>Farm, store, or source note<input className={styles.input} name="sourceNote" maxLength={1000} placeholder="Saturday farm box" /></label>
    <label className={styles.field}>Lot or package reference<input className={styles.input} name="lotCode" maxLength={120} placeholder="Optional label from the package" /></label>
    <p className={styles.formNotice}>Leave unknown dates blank. These details describe the purchase, not the amount remaining.</p>
  </details>;
}

function PurchaseHistory({ state, ingredient }: { state: HouseholdState; ingredient: HouseholdState["pantry"][number] }) {
  const purchases = state.pilot!.purchaseLots.filter((purchase) => purchase.ingredientId === ingredient.id && purchase.unit === ingredient.unit).slice().reverse();
  if (!purchases.length) return null;
  return <details className={styles.details}><summary>Purchase history · {purchases.length}</summary>
    <p className={styles.formNotice}>Historical amounts brought home. These are not remaining stock balances.</p>
    <ul className={styles.shoppingList}>{purchases.slice(0, 20).map((purchase) => <li className={styles.shoppingItem} key={purchase.id}><div><strong>{amount(purchase.quantity, purchase.unit)} purchased</strong><small>{purchase.purchasedOn ? `Purchased ${dateLabel(purchase.purchasedOn, { month: "short", day: "numeric", year: "numeric" })}` : "Purchase date not recorded"} · recorded {new Date(purchase.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>{purchase.bestBefore ? <small>Best before {dateLabel(purchase.bestBefore, { month: "short", day: "numeric", year: "numeric" })}</small> : null}{purchase.sourceNote ? <small>{purchase.sourceNote}</small> : null}{purchase.lotCode ? <small>Lot / package: {purchase.lotCode}</small> : null}</div></li>)}</ul>
    {purchases.length > 20 ? <p className={styles.formNotice}>Showing the latest 20 purchases. Earlier records remain saved.</p> : null}
  </details>;
}

function StockPurchaseForm({ ingredient, run }: { ingredient: HouseholdState["pantry"][number]; run: RunCommand }) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  return <details className={styles.details}><summary>Record a purchase of {ingredient.name}</summary><form onSubmit={async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    savingRef.current = true; setSaving(true);
    try { if (await run({ type: "record_purchase", items: [{ ingredientId: ingredient.id, name: ingredient.name, unit: ingredient.unit, quantity: Number(data.get("purchaseQuantity")), ...purchaseDetails(data) }] })) element.reset(); }
    finally { savingRef.current = false; setSaving(false); }
  }}><fieldset className={styles.settingsFields} disabled={saving}><label className={styles.field}>Amount purchased ({ingredient.unit})<input className={styles.input} type="number" name="purchaseQuantity" min={0.001} max={100000} step="any" required placeholder="What you actually brought home" /></label><PurchaseDetailsFields /><button className={styles.quietButton}>{saving ? "Saving…" : "Confirm purchase"}</button><p className={styles.formNotice}>The purchase is recorded even if a meal is later canceled. An unknown prior balance stays uncertain.</p></fieldset></form></details>;
}
