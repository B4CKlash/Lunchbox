import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateManualInvites, parseInviteInput, readPrivateJson, reservePrivateOutput, type InviteAdmin, type InviteUser, type PrivateInviteOutput } from "../../../scripts/manual-account-invites";

const origin = "https://lunchbox-git-example-team.vercel.app";
const projectRef = "abcdefghijklmnopqrst";
const userId = "11111111-1111-4111-8111-111111111111";
const input = { projectRef, appOrigin: origin, accounts: [{ email: "person@example.test", displayName: "Person" }] };
const user = (overrides: Partial<InviteUser> = {}): InviteUser => ({ id: userId, email: input.accounts[0].email,
  user_metadata: { display_name: "Person", needs_password_setup: true }, ...overrides });
function fakeAdmin(existing: InviteUser[] = []) {
  const generated: Parameters<InviteAdmin["generateLink"]>[0][] = [];
  const admin: InviteAdmin = {
    listUsers: async ({ page, perPage }) => ({ data: { users: existing.slice((page - 1) * perPage, page * perPage) }, error: null }),
    generateLink: async (request) => {
      generated.push(request);
      return { error: null, data: { user: user({ email: request.email, user_metadata: request.options.data }), properties: {
        action_link: `https://${projectRef}.supabase.co/auth/v1/verify?token=private-token&type=invite&redirect_to=${encodeURIComponent(request.options.redirectTo)}`,
        hashed_token: "a".repeat(64), redirect_to: request.options.redirectTo, verification_type: "invite",
      } } };
    },
  };
  return { admin, generated };
}

test("manual invite input rejects duplicate addresses and unsafe destinations", () => {
  assert.throws(() => parseInviteInput({ ...input, accounts: [input.accounts[0], { ...input.accounts[0], email: "PERSON@example.test" }] }), /duplicate/);
  for (const appOrigin of ["http://example.test", `${origin}/account`, `${origin}?redirect=elsewhere`, `${origin}#token`, "https://name:secret@example.test", "https://lunchbox-snowy.vercel.app"]) {
    assert.throws(() => parseInviteInput({ ...input, appOrigin }));
  }
  assert.equal(parseInviteInput({ ...input, appOrigin: `${origin}/` }).appOrigin, origin);
});

test("manual invites use only generateLink invite and expected setup metadata", async () => {
  const { admin, generated } = fakeAdmin();
  const persisted: PrivateInviteOutput[] = [];
  const result = await generateManualInvites(input, admin, async (output) => { persisted.push(structuredClone(output)); });
  assert.deepEqual(generated, [{ type: "invite", email: input.accounts[0].email,
    options: { redirectTo: `${origin}/account`, data: { display_name: "Person", needs_password_setup: true } } }]);
  assert.equal(result.status, "complete");
  assert.equal(result.completed[0].userId, userId);
  assert.equal(result.completed[0].reissued, false);
  const invite = new URL(result.completed[0].inviteLink);
  assert.equal(invite.origin, origin);
  assert.equal(invite.pathname, "/account");
  assert.equal(invite.search, "");
  assert.equal(new URLSearchParams(invite.hash.slice(1)).get("token_hash"), "a".repeat(64));
  assert.equal(new URLSearchParams(invite.hash.slice(1)).get("type"), "invite");
  assert.ok(!("hashed_token" in result.completed[0]), "Do not retain a separate token field.");
  assert.deepEqual(persisted.map((entry) => [entry.status, entry.completed.length]), [["running", 0], ["running", 1], ["complete", 1]]);
});

test("preflight scans pagination and rejects any existing recipient before creating anyone", async () => {
  const existing = Array.from({ length: 100 }, (_, index) => user({ id: `filler-${index}`, email: `filler-${index}@example.test` }));
  existing.push(user());
  const { admin, generated } = fakeAdmin(existing);
  await assert.rejects(generateManualInvites({ ...input, accounts: [{ email: "new@example.test", displayName: "New" }, input.accounts[0]] }, admin, async () => undefined), /Account 2 already exists/);
  assert.equal(generated.length, 0);
});

test("reissue requires exact pending user and refuses confirmed, signed-in, or unrelated accounts", async () => {
  const reissue = { ...input, accounts: [{ ...input.accounts[0], reissueUserId: userId }] };
  for (const existing of [[], [user({ id: "22222222-2222-4222-8222-222222222222" })], [user({ email_confirmed_at: "2026-01-01" })],
    [user({ last_sign_in_at: "2026-01-01" })], [user({ user_metadata: {} })]]) {
    const { admin, generated } = fakeAdmin(existing);
    await assert.rejects(generateManualInvites(reissue, admin, async () => undefined), /not the exact pending invite/);
    assert.equal(generated.length, 0);
  }
  const { admin } = fakeAdmin([user()]);
  assert.equal((await generateManualInvites(reissue, admin, async () => undefined)).completed[0].reissued, true);
});

test("generated action links must preserve exact Supabase project and account redirect", async () => {
  for (const replacement of [
    { action_link: "https://other.example/auth/v1/verify?type=invite&token=secret" },
    { redirect_to: `${origin}/` }, { verification_type: "recovery" },
    { hashed_token: "" },
    { action_link: `https://${projectRef}.supabase.co/auth/v1/verify?token=secret&type=invite&redirect_to=${encodeURIComponent(`${origin}/other`)}` },
  ]) {
    const { admin } = fakeAdmin();
    const original = admin.generateLink;
    admin.generateLink = async (request) => { const result = await original(request); return { ...result, data: { ...result.data, properties: { ...result.data.properties!, ...replacement } } }; };
    await assert.rejects(generateManualInvites(input, admin, async () => undefined), /exact project and \/account/);
  }
});

test("partial generation preserves completed private links and suppresses raw service errors", async () => {
  const { admin } = fakeAdmin();
  const original = admin.generateLink;
  admin.generateLink = async (request) => request.email.startsWith("second")
    ? { data: { user: null, properties: null }, error: new Error("raw-secret-token private@example.test") }
    : original(request);
  const saved: PrivateInviteOutput[] = [];
  await assert.rejects(generateManualInvites({ ...input, accounts: [...input.accounts, { email: "second@example.test", displayName: "Second" }] }, admin,
    async (output) => { saved.push(structuredClone(output)); }), /Account 2 invite generation did not complete/);
  const last = saved.at(-1)!;
  assert.equal(last.status, "failed");
  assert.equal(last.completed.length, 1);
  assert.equal(last.failedAccountNumber, 2);
  assert.ok(!JSON.stringify(last).includes("raw-secret-token"));
});

test("private files stay owner-only, reject symlinks/outside paths, and never overwrite prior links", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "lunchbox-invites-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const local = join(root, ".local"); await mkdir(local, { mode: 0o700 });
  const source = join(local, "input.json"); await writeFile(source, JSON.stringify(input), { mode: 0o600 });
  assert.deepEqual(await readPrivateJson(source, local), input);
  const linked = join(local, "linked.json"); await symlink(source, linked);
  await assert.rejects(readPrivateJson(linked, local), /owner-only/);
  const publicFile = join(local, "public.json"); await writeFile(publicFile, "{}", { mode: 0o644 });
  await assert.rejects(readPrivateJson(publicFile, local), /owner-only/);
  await assert.rejects(reservePrivateOutput(join(root, "outside.json"), local), /inside ignored/);
  const output = join(local, "links.json");
  const persist = await reservePrivateOutput(output, local);
  await generateManualInvites(input, fakeAdmin().admin, persist);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  const before = await readFile(output, "utf8");
  await assert.rejects(reservePrivateOutput(output, local));
  assert.equal(await readFile(output, "utf8"), before);
});
