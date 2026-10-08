"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { LoaderCircle, RefreshCw, Send, X } from "lucide-react";
import { cancelLocalAiJob, readLatestLocalAiJob, readLocalAiJob, requestLocalAiJob } from "@/features/meals/jobs-client";
import type { AiJob } from "@/features/meals/jobs";
import type { PlanningSession } from "@/lib/contracts";
import styles from "./planning-workspace.module.css";

export type LocalAssistantHandle = { request: (text: string) => void };

export function LocalPlanningAssistant({ householdId, revision, session, onResult, requestRef, draft, onDraftChange, onDraftSubmitted, storageError }: {
  householdId: string | null;
  revision: number;
  session: PlanningSession;
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
  const handled = useRef(new Set<string>());
  const scope = useRef(householdId);
  const active = job?.status === "queued" || job?.status === "running";
  const jobId = job?.id;
  const jobStatus = job?.status;
  const saved = job ? session.messages.some((message) => message.id === `job-${job.id}-assistant`) : false;

  // Job polling only observes a request the user made; it never starts inference.
  const acceptResult = useEffectEvent(async (next: AiJob) => {
    if (next.status !== "completed" || handled.current.has(next.id)) return;
    if (session.messages.some((message) => message.id === `job-${next.id}-assistant`)) { handled.current.add(next.id); return; }
    if (next.householdRevision !== revision || next.sessionId !== session.id) {
      setError("The household changed while this response was being prepared. Its suggestions were discarded. Retry with the current context.");
      return;
    }
    handled.current.add(next.id);
    const applied = await onResult(next);
    if (!applied) { handled.current.delete(next.id); setError("The response is ready but could not be saved. Resolve the unsaved household change, then retry reading it."); }
  });

  useEffect(() => {
    scope.current = householdId;
    if (!householdId) return;
    const controller = new AbortController();
    void readLatestLocalAiJob(householdId, session.id, controller.signal).then(async (result) => {
      if (controller.signal.aborted) return;
      setJob(result.job); setOnline(result.workerOnline);
      if (result.job) await acceptResult(result.job);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not check the local assistant."); });
    return () => controller.abort();
  }, [householdId, session.id]);

  useEffect(() => {
    if (!householdId || !jobId || !jobStatus || !["queued", "running"].includes(jobStatus)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await readLocalAiJob(householdId, jobId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(result.job); setOnline(result.workerOnline);
        await acceptResult(result.job);
        if (["queued", "running"].includes(result.job.status)) timer = setTimeout(poll, result.workerOnline ? 2000 : 5000);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not check this request. Retry when the connection returns.");
      }
    };
    timer = setTimeout(poll, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [householdId, jobId, jobStatus]);

  async function request(text = draft) {
    if (!householdId || !text.trim() || sending) return;
    if (active) { onDraftChange(text); setError("A request is already active. Cancel it to send this revised request, or wait for its response."); return; }
    const originalHousehold = householdId;
    setSending(true); setError(null);
    try {
      const result = await requestLocalAiJob({ id: crypto.randomUUID(), householdId, expectedRevision: revision, sessionId: session.id, request: { kind: "planning", message: text.trim() } });
      if (scope.current !== originalHousehold) return;
      setJob(result.job); setOnline(result.workerOnline); onDraftSubmitted(text);
    } catch (reason) { if (scope.current === originalHousehold) setError(reason instanceof Error ? reason.message : "The request was not queued. Try again."); }
    finally { setSending(false); }
  }

  useImperativeHandle(requestRef, () => ({ request: (text) => { void request(text); } }));

  async function refresh() {
    if (!householdId || !job) return;
    setError(null);
    try {
      const result = await readLocalAiJob(householdId, job.id);
      setJob(result.job); setOnline(result.workerOnline);
      // Explicit retries also pass through the same stale-state and duplicate checks.
      if (result.job.status === "completed" && !saved) {
        if (result.job.householdRevision !== revision) setError("The household context changed. Send a new request to use the latest plan.");
        else if (!handled.current.has(result.job.id)) {
          handled.current.add(result.job.id);
          if (!await onResult(result.job)) handled.current.delete(result.job.id);
        }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not check this request."); }
  }

  async function cancel() {
    if (!householdId || !job) return;
    try { const result = await cancelLocalAiJob(householdId, job.id); setJob(result.job); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Cancellation could not be confirmed. Retry before sending another request."); }
  }

  if (!householdId) return <div className={styles.composer}><p className={styles.subtle}>Connect a shared household and its authenticated Mac worker to use local AI. Manual planning and fixtures remain available.</p><Link href="/account" className={styles.quietButton}>Set up household sharing</Link></div>;
  return <div className={styles.composer}>
    {job ? <div className={styles.jobStatus} role="status"><strong>{saved ? "Response saved to this session" : job.status === "queued" ? online ? "Queued for your Mac" : "Local AI is offline · request queued" : job.status === "running" ? online ? "Your Mac is preparing a response…" : "Worker connection lost · request can resume" : job.status === "completed" ? "Response ready" : job.status === "cancelled" ? "Request cancelled" : job.status === "stale" ? "Household changed · response discarded" : "Local AI could not finish this request"}</strong>{job.request.kind === "planning" ? <p>{job.request.message}</p> : null}<div className={styles.buttonRow}><button className={styles.smallButton} onClick={() => void refresh()}><RefreshCw size={12} />Check connection</button>{active ? <button className={styles.smallButton} onClick={() => void cancel()}><X size={12} />Cancel request</button> : !saved && job.request.kind === "planning" ? <button className={styles.smallButton} onClick={() => void request(job.request.kind === "planning" ? job.request.message : "")}><RefreshCw size={12} />Retry with current context</button> : null}</div></div> : <p className={styles.subtle}>The request runs on your private Mac worker. Responses propose changes for your review.</p>}
    {error ? <p className={styles.notice} role="alert">{error}</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); void request(); }}><label className="sr-only" htmlFor="local-planning-message">Message your local AI assistant</label><textarea id="local-planning-message" className={styles.textarea} maxLength={2000} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Tell your local assistant what the week needs…" /><div className={styles.composerFooter}><span>{storageError ? "Draft is not saved" : "Draft saved on this device"} · no paid fallback</span><button className={`${styles.quietButton} ${styles.primary}`} disabled={sending || active || !draft.trim()}>{sending || active ? <LoaderCircle size={14} /> : <Send size={14} />}{sending ? "Queuing…" : active ? "Request active" : "Ask local AI"}</button></div></form>
  </div>;
}
