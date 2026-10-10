"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { LoaderCircle, RefreshCw, Send, X } from "lucide-react";
import { cancelLocalAiJob, readLatestLocalAiJob, readLocalAiJob, requestLocalAiJob } from "@/features/meals/jobs-client";
import { createPlanningRefreshQueue, isPlanningRefresh, planningRefreshSummary } from "@/features/meals/planning-refresh";
import type { AiJob } from "@/features/meals/jobs";
import type { PlanningSession } from "@/lib/contracts";
import styles from "./planning-workspace.module.css";

export type LocalAssistantHandle = { request: (text: string) => void; refreshIdeas: (reason: string) => void };
const isActive = (job: AiJob | null) => job?.status === "queued" || job?.status === "running";
const isRefreshJob = (job: AiJob | null) => job?.request.kind === "planning" && isPlanningRefresh(job.request.message);

export function LocalPlanningAssistant({ householdId, actorMemberId, revision, session, contextFingerprint, onResult, requestRef, draft, onDraftChange, onDraftSubmitted, storageError }: {
  householdId: string | null;
  actorMemberId: string | null;
  revision: number;
  session: PlanningSession;
  contextFingerprint: string;
  onResult: (job: AiJob) => Promise<boolean>;
  requestRef?: Ref<LocalAssistantHandle>;
  draft: string;
  onDraftChange: (text: string) => void;
  onDraftSubmitted: (text: string) => void;
  storageError: string | null;
}) {
  const [job, setJob] = useState<AiJob | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const handled = useRef(new Set<string>());
  const scopeKey = `${householdId ?? ""}:${actorMemberId ?? ""}:${session.id}`;
  const scope = useRef<string | null>(null);
  const jobRef = useRef<AiJob | null>(null);
  const manualSending = useRef(false);
  const receivingResult = useRef(false);
  const jobEpoch = useRef(0);
  const requestContext = useRef({ householdId, revision, session, scopeKey, onResult });
  const queue = useRef<ReturnType<typeof createPlanningRefreshQueue> | null>(null);
  const fingerprint = useRef<{ scope: string; value: string } | null>(null);
  const active = isActive(job);
  const autoJob = isRefreshJob(job);
  const jobId = job?.id;
  const jobStatus = job?.status;
  const saved = job ? session.messages.some((message) => message.id === `job-${job.id}-assistant`) : false;
  const publishJob = useCallback((next: AiJob | null) => { jobRef.current = next; setJob(next); }, []);

  useEffect(() => { requestContext.current = { householdId, revision, session, scopeKey, onResult }; }, [householdId, revision, session, scopeKey, onResult]);

  // Reading a queued request never starts inference. Results retain the source
  // household revision and pass the provider's atomic validation before saving.
  async function saveResult(next: AiJob, epoch: number) {
    if (scope.current !== scopeKey || jobEpoch.current !== epoch || jobRef.current?.id !== next.id || receivingResult.current) return;
    if (next.status !== "completed" || handled.current.has(next.id)) return;
    const context = requestContext.current;
    if (context.session.messages.some((message) => message.id === `job-${next.id}-assistant`)) { handled.current.add(next.id); return; }
    if (next.householdRevision !== context.revision || next.sessionId !== context.session.id) {
      setError("The household changed while this response was being prepared. Its suggestions were discarded. Retry with the current context.");
      return;
    }
    handled.current.add(next.id);
    receivingResult.current = true; setReceiving(true);
    try {
      const applied = await context.onResult(next);
      if (!applied && scope.current === scopeKey) { handled.current.delete(next.id); setError("The response is ready but could not be saved. Resolve the unsaved household change, then retry reading it."); }
    } finally { receivingResult.current = false; if (scope.current === scopeKey) setReceiving(false); }
  }
  const acceptResult = useEffectEvent(saveResult);

  const sendRefresh = useEffectEvent(async (message: string, signal: AbortSignal): Promise<"sent" | "deferred"> => {
    if (!householdId || !actorMemberId || signal.aborted || scope.current !== scopeKey) return "sent";
    if (document.visibilityState !== "visible" || manualSending.current || receivingResult.current || (isActive(jobRef.current) && !isRefreshJob(jobRef.current))) return "deferred";
    const originalHousehold = householdId;
    const originalScope = scopeKey;
    const epoch = ++jobEpoch.current;
    try {
      const previous = jobRef.current;
      if (isActive(previous) && previous) {
        const cancelled = await cancelLocalAiJob(originalHousehold, previous.id);
        if (signal.aborted || scope.current !== originalScope || jobEpoch.current !== epoch) return "sent";
        publishJob(cancelled.job);
      }
      const context = requestContext.current;
      const result = await requestLocalAiJob({ id: crypto.randomUUID(), householdId: originalHousehold, expectedRevision: context.revision, sessionId: context.session.id, request: { kind: "planning", message } });
      if (result.deferred) {
        // This job belongs to a manual request on another device. Observing it
        // does not give this refresh ownership to cancel it on supersession.
        if (!signal.aborted && scope.current === originalScope && jobEpoch.current === epoch) {
          publishJob(result.job); setOnline(result.workerOnline); setError(null);
          return "deferred";
        }
        return "sent";
      }
      const cancelSuperseded = () => { void cancelLocalAiJob(originalHousehold, result.job.id).catch(() => undefined); };
      if (signal.aborted || scope.current !== originalScope || jobEpoch.current !== epoch) {
        // A manual request waits for this POST and its cancellation to settle,
        // so an old refresh cannot arrive later and supersede the user's job.
        await cancelLocalAiJob(originalHousehold, result.job.id);
        return "sent";
      }
      signal.addEventListener("abort", cancelSuperseded, { once: true });
      publishJob(result.job); setOnline(result.workerOnline); setError(null);
      return "sent";
    } catch (reason) {
      if (!signal.aborted && scope.current === originalScope && jobEpoch.current === epoch) setError(reason instanceof Error ? reason.message : "Ideas could not be refreshed. Your draft and existing meals are unchanged.");
      return "sent";
    }
  });

  useEffect(() => {
    scope.current = scopeKey;
    const refreshQueue = createPlanningRefreshQueue((message, signal) => sendRefresh(message, signal));
    queue.current = refreshQueue;
    const controller = new AbortController();
    const epoch = jobEpoch.current;
    if (householdId && actorMemberId) void readLatestLocalAiJob(householdId, session.id, controller.signal).then(async (result) => {
      if (controller.signal.aborted || jobEpoch.current !== epoch) return;
      publishJob(result.job); setOnline(result.workerOnline);
      if (result.job) await acceptResult(result.job, epoch);
    }).catch((reason: unknown) => { if (!controller.signal.aborted && jobEpoch.current === epoch) setError(reason instanceof Error ? reason.message : "Could not check the local assistant."); });
    const resumeWhenVisible = () => { if (document.visibilityState === "visible") refreshQueue.resume(); };
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => {
      scope.current = null;
      controller.abort(); refreshQueue.dispose(); queue.current = null;
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, [householdId, actorMemberId, session.id, scopeKey, publishJob]);

  useEffect(() => {
    const previous = fingerprint.current;
    fingerprint.current = { scope: scopeKey, value: contextFingerprint };
    // Mounting, switching modes, and changing accounts never generate a request.
    if (previous?.scope === scopeKey && previous.value !== contextFingerprint && document.visibilityState === "visible") queue.current?.enqueue("your kitchen or planning preferences changed");
  }, [contextFingerprint, scopeKey]);

  useEffect(() => {
    if (!active && !sending && !receiving) queue.current?.resume();
  }, [active, sending, receiving]);

  useEffect(() => {
    if (!householdId || !jobId || !jobStatus || !["queued", "running"].includes(jobStatus)) return;
    const controller = new AbortController();
    const epoch = jobEpoch.current;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await readLocalAiJob(householdId, jobId, controller.signal);
        if (controller.signal.aborted || jobEpoch.current !== epoch || jobRef.current?.id !== jobId) return;
        publishJob(result.job); setOnline(result.workerOnline);
        await acceptResult(result.job, epoch);
        if (["queued", "running"].includes(result.job.status)) timer = setTimeout(poll, result.workerOnline ? 2000 : 5000);
      } catch (reason) {
        if (!controller.signal.aborted && jobEpoch.current === epoch) setError(reason instanceof Error ? reason.message : "Could not check this request. Retry when the connection returns.");
      }
    };
    timer = setTimeout(poll, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [householdId, jobId, jobStatus, publishJob]);

  async function request(text = draft) {
    if (!householdId || !actorMemberId || !text.trim() || manualSending.current || receivingResult.current) return;
    const previous = jobRef.current;
    if (isActive(previous) && !isRefreshJob(previous)) { onDraftChange(text); setError("A request is already active. Cancel it to send this revised request, or wait for its response."); return; }
    const originalScope = scopeKey;
    const epoch = ++jobEpoch.current;
    manualSending.current = true;
    setSending(true); setError(null);
    try {
      await queue.current?.clearAndWait();
      if (isActive(previous) && previous) {
        const cancelled = await cancelLocalAiJob(householdId, previous.id);
        if (scope.current !== originalScope || jobEpoch.current !== epoch) return;
        publishJob(cancelled.job);
      }
      if (scope.current !== originalScope || jobEpoch.current !== epoch) return;
      const context = requestContext.current;
      const result = await requestLocalAiJob({ id: crypto.randomUUID(), householdId, expectedRevision: context.revision, sessionId: context.session.id, request: { kind: "planning", message: text.trim() } });
      if (scope.current !== originalScope || jobEpoch.current !== epoch) return;
      publishJob(result.job); setOnline(result.workerOnline); onDraftSubmitted(text);
    } catch (reason) { if (scope.current === originalScope && jobEpoch.current === epoch) setError(reason instanceof Error ? reason.message : "The request was not queued. Try again."); }
    finally { manualSending.current = false; if (scope.current === originalScope) setSending(false); }
  }

  useImperativeHandle(requestRef, () => ({ request: (text) => { void request(text); }, refreshIdeas: (reason) => { if (document.visibilityState === "visible") queue.current?.enqueue(reason); } }));

  async function refresh() {
    if (!householdId || !job) return;
    const epoch = jobEpoch.current;
    const expectedScope = scopeKey;
    const expectedJob = job.id;
    setError(null);
    try {
      const result = await readLocalAiJob(householdId, expectedJob);
      if (scope.current !== expectedScope || jobEpoch.current !== epoch || jobRef.current?.id !== expectedJob) return;
      publishJob(result.job); setOnline(result.workerOnline);
      await saveResult(result.job, epoch);
    } catch (reason) { if (scope.current === expectedScope && jobEpoch.current === epoch) setError(reason instanceof Error ? reason.message : "Could not check this request."); }
  }

  async function cancel() {
    if (!householdId || !job) return;
    const epoch = ++jobEpoch.current;
    const expectedScope = scopeKey;
    try {
      await queue.current?.clearAndWait();
      const result = await cancelLocalAiJob(householdId, job.id);
      if (scope.current !== expectedScope || jobEpoch.current !== epoch) return;
      publishJob(result.job); setError(null);
    } catch (reason) { if (scope.current === expectedScope && jobEpoch.current === epoch) setError(reason instanceof Error ? reason.message : "Cancellation could not be confirmed. Retry before sending another request."); }
  }

  if (!householdId) return <div className={styles.composer}><p className={styles.subtle}>Connect a shared household and its authenticated Mac worker to use local AI. Manual planning and fixtures remain available.</p><Link href="/account" className={styles.quietButton}>Set up household sharing</Link></div>;
  return <div className={styles.composer}>
    {job ? <div className={styles.jobStatus} role="status"><strong>{saved ? autoJob ? "Fresh ideas saved to this session" : "Response saved to this session" : job.status === "queued" ? online ? autoJob ? "Fresh ideas queued for your Mac" : "Queued for your Mac" : "Local AI is offline · request queued" : job.status === "running" ? online ? autoJob ? "Refreshing ideas for your current plan…" : "Your Mac is preparing a response…" : "Worker connection lost · request can resume" : job.status === "completed" ? "Response ready" : job.status === "cancelled" ? "Request cancelled" : job.status === "stale" ? "Household changed · response discarded" : "Local AI could not finish this request"}</strong>{job.request.kind === "planning" ? <p>{planningRefreshSummary(job.request.message)}</p> : null}<div className={styles.buttonRow}><button className={styles.smallButton} onClick={() => void refresh()}><RefreshCw size={12} />Check connection</button>{active ? <button className={styles.smallButton} onClick={() => void cancel()}><X size={12} />Cancel request</button> : !saved && job.request.kind === "planning" ? <button className={styles.smallButton} onClick={() => { if (isRefreshJob(job)) queue.current?.enqueue("you asked to refresh the current ideas"); else void request(job.request.kind === "planning" ? job.request.message : ""); }}><RefreshCw size={12} />Retry with current context</button> : null}</div></div> : <p className={styles.subtle}>Your private Mac worker responds to messages and relevant planning changes. Refreshes suggest ideas; they leave existing meals unchanged.</p>}
    {error ? <p className={styles.notice} role="alert">{error}</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); void request(); }}><label className="sr-only" htmlFor="local-planning-message">Message your local AI assistant</label><textarea id="local-planning-message" className={styles.textarea} maxLength={2000} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Tell your local assistant what the week needs…" /><div className={styles.composerFooter}><span>{storageError ? "Draft is not saved" : "Draft saved on this device"} · no paid fallback</span><button className={`${styles.quietButton} ${styles.primary}`} disabled={sending || receiving || (active && !autoJob) || !actorMemberId || !draft.trim()}>{sending || (active && !autoJob) ? <LoaderCircle size={14} /> : <Send size={14} />}{sending ? "Queuing…" : receiving ? "Saving response…" : active && !autoJob ? "Request active" : "Ask local AI"}</button></div></form>
  </div>;
}
