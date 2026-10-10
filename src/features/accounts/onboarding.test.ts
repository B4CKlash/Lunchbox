import assert from "node:assert/strict";
import test from "node:test";
import { accountActionError, accountCallbackError, accountCallbackPath, accountInvitation, invitationCannotBeRetried, needsPasswordSetup, passwordSetupError, unusableAccountLinkMessage } from "./onboarding";

test("only a single invite token hash is staged for explicit acceptance", () => {
  const tokenHash = "a".repeat(64);
  assert.deepEqual(accountInvitation(`#token_hash=${tokenHash}&type=invite`), { status: "pending", tokenHash });
  assert.deepEqual(accountInvitation("#access_token=existing&refresh_token=existing&type=invite"), { status: "absent" });
  for (const hash of [`#token_hash=${tokenHash}&type=recovery`, `#token_hash=${tokenHash}&type=invite&type=invite`, `#token_hash=${tokenHash}&token_hash=${tokenHash}&type=invite`, "#token_hash=too-short&type=invite"])
    assert.deepEqual(accountInvitation(hash), { status: "invalid" });
});

test("expired or invalid invitations clear pending credentials while temporary failures can retry", () => {
  assert.equal(invitationCannotBeRetried({ code: "otp_expired" }), true);
  assert.equal(invitationCannotBeRetried({ status: 403 }), true);
  assert.equal(invitationCannotBeRetried({ status: 429 }), false);
  assert.equal(invitationCannotBeRetried({ status: 503 }), false);
  assert.equal(invitationCannotBeRetried(new Error("network unavailable")), false);
});

test("invite callback errors are recognized in either URL component without reflecting untrusted text", () => {
  assert.equal(accountCallbackError("", "#error=access_denied&error_code=otp_expired&error_description=https://private.example/token"), unusableAccountLinkMessage);
  assert.equal(accountCallbackError("?error_description=private%20bearer%20value", ""), unusableAccountLinkMessage);
  assert.equal(accountCallbackError("?error_code=", ""), unusableAccountLinkMessage);
  assert.equal(accountCallbackError("?page=account", "#type=invite&access_token=private&refresh_token=private"), null);
  assert.equal(accountCallbackError("", ""), null);
});

test("captured invite credentials and errors leave the URL while preview access and standard callbacks remain", () => {
  assert.equal(accountCallbackPath("/account", "?_vercel_share=preview-access", `#type=invite&token_hash=${"a".repeat(64)}`), "/account?_vercel_share=preview-access");
  assert.equal(accountCallbackPath("/account", "?error_description=untrusted&error_code=otp_expired&_vercel_share=preview-access", "#refresh_token=private"), "/account?_vercel_share=preview-access");
  assert.equal(accountCallbackPath("/account", "", "#access_token=private&refresh_token=private&type=invite"), "/account#access_token=private&refresh_token=private&type=invite");
  assert.equal(accountCallbackPath("/account", "", "#profile"), "/account#profile");
});

test("failed invites cannot trigger password setup for a previously signed-in account", () => {
  const invited = { user_metadata: { needs_password_setup: true } };
  assert.equal(needsPasswordSetup(invited, null), true);
  assert.equal(needsPasswordSetup(invited, unusableAccountLinkMessage), false);
  assert.equal(needsPasswordSetup({ user_metadata: { needs_password_setup: "true" } }, null), false);
  assert.equal(needsPasswordSetup({ user_metadata: { needs_password_setup: false } }, null), false);
  assert.equal(needsPasswordSetup(null, null), false);
});

test("password setup checks minimum length and exact confirmation without trimming passwords", () => {
  assert.match(passwordSetupError("short", "short")!, /8 characters/);
  assert.match(passwordSetupError("long enough", "long enough ")!, /do not match/);
  assert.equal(passwordSetupError(" long enough ", " long enough "), null);
});

test("account errors use fixed messages and distinguish pilot onboarding from email signup", () => {
  assert.match(accountActionError({ code: "email_not_confirmed" }, "signin", true), /personal invitation/);
  assert.equal(accountActionError({ code: "email_not_confirmed" }, "signin"), "Confirm your email before signing in.");
  assert.match(accountActionError({ code: "same_password" }, "password"), /different/);
  assert.match(accountActionError({ code: "invalid_credentials" }, "signin"), /not recognized/);
  const privateFailure = { code: "unknown", message: "https://private.example/?access_token=secret" };
  assert.equal(accountActionError(privateFailure, "password"), "Your password was not saved. Check your connection and try again.");
  assert.equal(accountActionError(new Error(privateFailure.message), "signin"), "We could not sign you in. Check your connection and try again.");
});
