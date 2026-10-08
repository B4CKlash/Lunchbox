import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { chatMealsRequestSchema } from "../src/lib/contracts";
import { remoteHouseholdSchema } from "../src/features/pantry/remote-protocol";
import { aiJobSchema, isWorkerOnline, type AiJob } from "../src/features/meals/jobs";
import { claimsCompletedAction } from "../src/features/meals/planning-claims";
import { localModelSettings } from "../src/features/meals/local-model";

// Explicitly invoked verification only. This script never launches a worker or
// calls a model. Run it after other evaluation/browser jobs have finished.
const proofPath = ".local/legacy-chat-worker-smoke.json";
const message = "Explain how you could help us choose a simple lunch using our current kitchen and preferences. Give advice only; do not claim that you saved, scheduled, purchased, cooked, or changed anything. Do not return recipes for this explanation.";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
class SmokeFailure extends Error {}
const requireCondition: (condition: unknown, message: string) => asserts condition = (condition, detail) => {
  if (!condition) throw new SmokeFailure(detail);
};

function loopbackOrigin(value: string, label: string) {
  const url = new URL(value);
  requireCondition(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/", `${label} must be a loopback HTTP origin.`);
  return url.origin;
}

async function main() {
  if (!process.argv.includes("--run")) {
    console.info("Prepared only. After evaluation and browser jobs finish, run this script with --run and an already-running local worker.");
    return;
  }
  await mkdir(".local", { recursive: true });
  await writeFile(proofPath, `${JSON.stringify({ version: 1, status: "running", startedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  try { process.loadEnvFile(".env.local"); } catch { /* Injected environment is also supported. */ }
  const appOrigin = loopbackOrigin(process.env.LUNCHBOX_SMOKE_APP_URL || "http://127.0.0.1:3100", "Smoke app");
  const supabaseOrigin = loopbackOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL || "", "Supabase");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  requireCondition(publishableKey && serviceKey, "Local Supabase configuration is incomplete.");
  const credentials = z.object({ householdId: z.uuid(), accounts: z.object({ owner: z.object({ email: z.email(), password: z.string().min(1), userId: z.uuid() }) }) }).parse(JSON.parse(await readFile(".local/pilot-test-users.json", "utf8")));
  requireCondition(credentials.householdId === process.env.LUNCHBOX_WORKER_HOUSEHOLD_ID, "The development household does not match the configured worker scope.");
  const modelConfiguration = localModelSettings(); // Validation only; no model request.
  const admin = createClient(supabaseOrigin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = createClient(supabaseOrigin, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await auth.auth.signInWithPassword({ email: credentials.accounts.owner.email, password: credentials.accounts.owner.password });
  requireCondition(!signedIn.error && signedIn.data.session && signedIn.data.user.id === credentials.accounts.owner.userId, "Development owner sign-in failed.");
  const token = signedIn.data.session.access_token;
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(new URL(path, appOrigin), {
      method, redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    requireCondition(response.ok, `Local app request failed with HTTP ${response.status}.`);
    return await response.json() as unknown;
  };
  const before = remoteHouseholdSchema.parse(await call("/api/household"));
  requireCondition(before.householdId === credentials.householdId && before.currentMemberId && before.state.pilot, "Authenticated development household or actor does not match.");
  const membership = await admin.from("household_members").select("role,member_id").eq("household_id", before.householdId).eq("user_id", signedIn.data.user.id).single();
  requireCondition(!membership.error && membership.data.role === "owner" && membership.data.member_id === before.currentMemberId, "The test account is not the mapped development owner.");
  // Read-only administrative inspection prevents a smoke request from sharing
  // the single local worker with a benchmark or another household job.
  const active = await admin.from("household_ai_jobs").select("id").eq("household_id", before.householdId).in("status", ["queued", "running"]);
  requireCondition(!active.error && active.data.length === 0, "Finish or cancel existing development jobs before this isolated chat smoke.");
  const presence = await admin.from("household_ai_workers").select("last_seen_at").eq("household_id", before.householdId).maybeSingle();
  requireCondition(!presence.error && isWorkerOnline(presence.data?.last_seen_at), "Start the local worker after evaluation finishes; this script does not start it.");
  const input = chatMealsRequestSchema.parse({
    pantry: before.state.pantry, preferences: before.state.preferences, meals: before.state.meals,
    recipeBox: before.state.workspace.recipeBox, messages: [], message,
  });
  const jobId = randomUUID();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const statuses: string[] = [];
  let enqueued = false;
  let terminal = false;
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    enqueued = true; // Also cancel if the enqueue succeeded but its response was lost.
    const queued = z.object({ job: aiJobSchema }).parse(await call("/api/household/jobs", "POST", {
      id: jobId, householdId: before.householdId, expectedRevision: before.revision,
      sessionId: before.state.pilot.session.id, request: { kind: "chat", input },
    }));
    let job: AiJob = queued.job;
    while (true) {
      requireCondition(job.id === jobId && job.kind === "chat" && job.householdId === before.householdId
        && job.householdRevision === before.revision && job.actorMemberId === before.currentMemberId, "The returned job identity or household context changed.");
      if (statuses.at(-1) !== job.status) { statuses.push(job.status); console.info(`Legacy chat smoke: ${job.status}.`); }
      terminal = !["queued", "running"].includes(job.status);
      if (terminal) break;
      requireCondition(Date.now() - started < 600000, "The local chat worker did not finish within ten minutes.");
      await delay(2000, undefined, { signal: shutdown.signal });
      job = z.object({ job: aiJobSchema }).parse(await call(`/api/household/jobs?householdId=${before.householdId}&id=${jobId}`)).job;
    }
    requireCondition(job.status === "completed" && job.result?.kind === "chat", "The local worker did not return a completed validated chat result.");
    requireCondition(job.attempts > 0 && job.result.data.source === "ai", "The result did not come from a claimed AI worker job.");
    requireCondition(!claimsCompletedAction(job.result.data.reply), "The chat reply claimed an unsupported completed action.");
    const after = remoteHouseholdSchema.parse(await call("/api/household"));
    requireCondition(after.revision === before.revision && hash(after.state) === hash(before.state), "The household changed during this advisory smoke; rerun after other edits finish.");
    const proof = {
      version: 1, status: "passed", purpose: "Legacy chat through the authenticated app and real local worker", startedAt, completedAt: new Date().toISOString(), jobId,
      appOrigin, supabaseOrigin, modelConfiguration, durationMs: Date.now() - started, observedStatuses: statuses,
      request: { kind: "chat", message }, result: { kind: "chat", source: job.result.data.source, recipeCount: job.result.data.recipes.length,
        reply: job.result.data.reply.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]"), replySha256: hash(job.result.data.reply) },
      assertions: { responseSchemaValid: true, authenticatedOwner: true, actorPreserved: true, workerClaimObserved: true, noUnsupportedCompletedActionClaim: true, householdSnapshotUnchanged: true, householdRevisionUnchanged: true },
    };
    await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    console.info(`Legacy chat smoke passed. Sanitized evidence: ${proofPath}`);
  } finally {
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
    if (enqueued && !terminal) await call("/api/household/jobs", "DELETE", { householdId: before.householdId, id: jobId }).catch(() => {
      console.warn("Smoke request cancellation could not be confirmed; inspect development jobs before another run.");
    });
  }
}

main().catch(async (error: unknown) => {
  // Deliberately omit raw exceptions: schema/auth errors may contain private data.
  const detail = error instanceof SmokeFailure ? error.message : "Check local configuration, worker state, and the scoped development job.";
  await mkdir(".local", { recursive: true }).catch(() => undefined);
  await writeFile(proofPath, `${JSON.stringify({ version: 1, status: "failed", finishedAt: new Date().toISOString(), detail }, null, 2)}\n`, { mode: 0o600 }).catch(() => undefined);
  console.error(`Legacy chat smoke failed. ${detail}`);
  process.exitCode = 1;
});
