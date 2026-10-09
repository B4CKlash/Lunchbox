import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const accountSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(80),
  reissueUserId: z.uuid().optional(),
}).strict();
const inputSchema = z.object({
  projectRef: z.string().regex(/^[a-z0-9]{20}$/),
  appOrigin: z.string(),
  accounts: z.array(accountSchema).min(1).max(10),
}).strict();
export type InviteInput = z.infer<typeof inputSchema>;
export class ManualInviteError extends Error {}
const requireCondition: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new ManualInviteError(message);
};

export function parseInviteInput(value: unknown): InviteInput {
  const parsed = inputSchema.safeParse(value);
  requireCondition(parsed.success, "Input must contain a project reference, HTTPS app origin, and one to ten named accounts.");
  let origin: URL;
  try { origin = new URL(parsed.data.appOrigin); } catch { throw new ManualInviteError("App origin is invalid."); }
  requireCondition(origin.protocol === "https:" && !origin.username && !origin.password && origin.pathname === "/"
    && !origin.search && !origin.hash && origin.origin !== "https://lunchbox-snowy.vercel.app",
  "Use the protected development app's HTTPS origin, without a path, credentials, query, or fragment.");
  requireCondition(new Set(parsed.data.accounts.map((account) => account.email)).size === parsed.data.accounts.length,
    "Input contains duplicate email addresses.");
  return { ...parsed.data, appOrigin: origin.origin };
}

export type InviteUser = {
  id: string; email?: string; email_confirmed_at?: string; last_sign_in_at?: string;
  user_metadata: Record<string, unknown>;
};
type LinkProperties = { action_link: string; hashed_token: string; redirect_to: string; verification_type: string };
export type InviteAdmin = {
  listUsers(input: { page: number; perPage: number }): Promise<{ data: { users: InviteUser[] } | null; error: unknown }>;
  generateLink(input: { type: "invite"; email: string; options: { redirectTo: string; data: { display_name: string; needs_password_setup: true } } }):
    Promise<{ data: { properties: LinkProperties | null; user: InviteUser | null }; error: unknown }>;
};
export type PrivateInviteOutput = {
  version: 1; projectRef: string; appOrigin: string; redirectTo: string;
  createdAt: string; status: "running" | "complete" | "failed";
  completed: { email: string; displayName: string; userId: string; inviteLink: string; actionLink: string; generatedAt: string; reissued: boolean }[];
  failure?: string; failedAccountNumber?: number;
};

async function findExistingUsers(input: InviteInput, admin: InviteAdmin) {
  const targets = new Set(input.accounts.map((account) => account.email));
  const found = new Map<string, InviteUser>();
  // Inspect every page before generating any links: an existing second account
  // must not leave the first accidentally created as a partial batch.
  for (let page = 1; page <= 1000; page++) {
    const response = await admin.listUsers({ page, perPage: 100 });
    requireCondition(!response.error && response.data, "Could not verify existing accounts. No invite links were generated.");
    for (const user of response.data.users) {
      const email = user.email?.toLowerCase();
      if (email && targets.has(email)) {
        requireCondition(!found.has(email), "Existing account lookup is ambiguous. No invite links were generated.");
        found.set(email, user);
      }
    }
    if (response.data.users.length < 100) return found;
  }
  throw new ManualInviteError("Account listing exceeded its safety bound. No invite links were generated.");
}

function validateGeneratedLink(input: InviteInput, account: InviteInput["accounts"][number], properties: LinkProperties, user: InviteUser) {
  const redirectTo = `${input.appOrigin}/account`;
  let link: URL;
  try { link = new URL(properties.action_link); } catch { throw new ManualInviteError("The generated invite link is invalid; inspect the private batch before retrying."); }
  requireCondition(user.email?.toLowerCase() === account.email && z.uuid().safeParse(user.id).success
    && !user.email_confirmed_at && !user.last_sign_in_at
    && user.user_metadata.needs_password_setup === true && user.user_metadata.display_name === account.displayName
    && (!account.reissueUserId || user.id === account.reissueUserId),
  "Generated account does not match the intended unconfirmed invite. Inspect the private batch before retrying.");
  requireCondition(properties.verification_type === "invite" && properties.redirect_to === redirectTo
    && link.origin === `https://${input.projectRef}.supabase.co` && link.pathname === "/auth/v1/verify"
    && !link.username && !link.password && !link.hash
    && link.searchParams.get("type") === "invite" && Boolean(link.searchParams.get("token"))
    && link.searchParams.get("redirect_to") === redirectTo
    && typeof properties.hashed_token === "string" && /^[A-Za-z0-9_-]{32,512}$/.test(properties.hashed_token),
  "Generated link does not target the exact project and /account redirect. Check the Supabase redirect allowlist before retrying.");
  const inviteLink = new URL(redirectTo);
  inviteLink.hash = new URLSearchParams({ token_hash: properties.hashed_token, type: "invite" }).toString();
  return { actionLink: link.href, inviteLink: inviteLink.href };
}

/** Operator-only, dependency-injected boundary. No email method is exposed. */
export async function generateManualInvites(value: unknown, admin: InviteAdmin, persist: (output: PrivateInviteOutput) => Promise<void>) {
  const input = parseInviteInput(value);
  const output: PrivateInviteOutput = { version: 1, projectRef: input.projectRef, appOrigin: input.appOrigin,
    redirectTo: `${input.appOrigin}/account`, createdAt: new Date().toISOString(), status: "running", completed: [] };
  await persist(output);
  let accountNumber: number | undefined;
  try {
    const existing = await findExistingUsers(input, admin);
    for (const [index, account] of input.accounts.entries()) {
      const user = existing.get(account.email);
      if (!account.reissueUserId) {
        requireCondition(!user, `Account ${index + 1} already exists. Use its normal sign-in, or explicitly review an unconfirmed invite reissue.`);
      } else {
        requireCondition(user && user.id === account.reissueUserId && !user.email_confirmed_at && !user.last_sign_in_at
          && user.user_metadata.needs_password_setup === true,
        `Account ${index + 1} is not the exact pending invite. Confirmed or previously signed-in accounts cannot be reissued here.`);
      }
    }
    for (const [index, account] of input.accounts.entries()) {
      accountNumber = index + 1;
      const response = await admin.generateLink({ type: "invite", email: account.email,
        options: { redirectTo: output.redirectTo, data: { display_name: account.displayName, needs_password_setup: true } } });
      requireCondition(!response.error && response.data.user && response.data.properties,
        `Account ${index + 1} invite generation did not complete. Inspect the private batch and account before retrying.`);
      const links = validateGeneratedLink(input, account, response.data.properties, response.data.user);
      output.completed.push({ email: account.email, displayName: account.displayName, userId: response.data.user.id,
        ...links, generatedAt: new Date().toISOString(), reissued: Boolean(account.reissueUserId) });
      await persist(output); // Preserve earlier links if a later generation fails.
    }
    output.status = "complete";
    await persist(output);
    return output;
  } catch (error) {
    output.status = "failed";
    output.failure = error instanceof ManualInviteError ? error.message : "Invite generation failed. Raw service error omitted; inspect this private batch before retrying.";
    output.failedAccountNumber = accountNumber;
    await persist(output);
    throw new ManualInviteError(output.failure);
  }
}

function inside(root: string, candidate: string) {
  const part = relative(root, candidate);
  return part !== "" && !isAbsolute(part) && part !== ".." && !part.startsWith("../");
}

/** Refuse symlinks, public permissions, and files outside ignored .local. */
export async function readPrivateJson(path: string, privateRoot: string) {
  const root = await realpath(privateRoot);
  const target = resolve(path);
  const stat = await lstat(target);
  requireCondition(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0
    && inside(root, await realpath(target)), "Private JSON must be a regular owner-only file inside ignored .local.");
  try { return JSON.parse(await readFile(target, "utf8")) as unknown; }
  catch { throw new ManualInviteError("Private JSON could not be parsed."); }
}

/** Exclusive reservation prevents overwriting links from an earlier run. */
export async function reservePrivateOutput(path: string, privateRoot: string) {
  const root = await realpath(privateRoot);
  const requested = resolve(path);
  const parent = await realpath(dirname(requested));
  const target = resolve(parent, basename(requested));
  requireCondition(inside(root, target) && (parent === root || inside(root, parent)), "Output must be inside ignored .local.");
  const reservation = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  await reservation.close();
  return async (output: PrivateInviteOutput) => {
    const temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(output, null, 2)}\n`);
      await handle.sync();
      await handle.close();
      await rename(temporary, target);
      await chmod(target, 0o600);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.every((arg) => arg === "--run" || arg.startsWith("--input=") || arg.startsWith("--output=")),
    "Use --input=.local/private-input.json --output=.local/new-private-links.json and optional --run.");
  const inputArgs = args.filter((arg) => arg.startsWith("--input="));
  const outputArgs = args.filter((arg) => arg.startsWith("--output="));
  requireCondition(inputArgs.length === 1 && outputArgs.length === 1 && args.filter((arg) => arg === "--run").length <= 1,
    "Provide exactly one private input path and one new private output path. Add --run only when ready to generate accounts.");
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const privateRoot = resolve(repoRoot, ".local");
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const input = parseInviteInput(await readPrivateJson(resolve(repoRoot, inputArgs[0].slice(8)), privateRoot));
  if (!args.includes("--run")) { console.info(`Validated ${input.accounts.length} private account request(s). No credentials read, accounts created, or links generated.`); return; }
  // Service credentials are loaded only for this explicit operator invocation.
  // Environment variables/.env.local cannot silently select a different project.
  const values = z.object({ NEXT_PUBLIC_SUPABASE_URL: z.literal(`https://${input.projectRef}.supabase.co`), SUPABASE_SERVICE_ROLE_KEY: z.string().min(20) })
    .safeParse(await readPrivateJson(resolve(privateRoot, "hosted-preview-values.json"), privateRoot));
  requireCondition(values.success, "Private hosted settings do not match the requested project.");
  const persist = await reservePrivateOutput(resolve(repoRoot, outputArgs[0].slice(9)), privateRoot);
  const client = createClient(values.data.NEXT_PUBLIC_SUPABASE_URL, values.data.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const output = await generateManualInvites(input, client.auth.admin, persist);
  console.info(`Created ${output.completed.length} private account invite link(s). Saved to the requested owner-only output file. No email was sent.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    // Never include raw API errors, validation input, filenames, emails or URLs.
    console.error(error instanceof ManualInviteError ? error.message : "Manual invite command failed. Check private files, permissions, and the saved batch; no raw error is printed.");
    process.exitCode = 1;
  });
}
