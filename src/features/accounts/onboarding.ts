import type { User } from "@supabase/supabase-js";

export const unusableAccountLinkMessage = "This sign-in link could not be used. It may have expired or already been used. If you have a password, sign in again. Otherwise ask the pilot organizer for help with your account.";
const callbackErrorKeys = ["error", "error_code", "error_description"];

export type AccountInvitation = { status: "absent" } | { status: "invalid" } | { status: "pending"; tokenHash: string };

/** The app-local invite is redeemed only after an explicit button press. */
export function accountInvitation(hash: string): AccountInvitation {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("token_hash")) return { status: "absent" };
  const tokenHash = params.get("token_hash") ?? "";
  if (params.getAll("token_hash").length !== 1 || params.getAll("type").length !== 1 || params.get("type") !== "invite" || !/^[A-Za-z0-9_-]{32,512}$/.test(tokenHash))
    return { status: "invalid" };
  return { status: "pending", tokenHash };
}

export function invitationCannotBeRetried(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "otp_expired") return true;
  return "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500 && error.status !== 429;
}

/** Callback values are untrusted. Only classify them; never display their text. */
export function accountCallbackError(search: string, hash: string): string | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const hasError = [query, fragment].some((params) => callbackErrorKeys.some((key) => params.has(key)));
  return hasError ? unusableAccountLinkMessage : null;
}

export function accountCallbackPath(pathname: string, search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const failed = accountCallbackError(search, hash) !== null;
  for (const key of callbackErrorKeys) query.delete(key);
  const remainingQuery = query.toString();
  // Standard access-token callbacks stay untouched until Supabase consumes
  // them. App-local invite credentials and captured errors leave the URL now.
  return `${pathname}${remainingQuery ? `?${remainingQuery}` : ""}${failed || fragment.has("token_hash") ? "" : hash}`;
}

export function needsPasswordSetup(user: Pick<User, "user_metadata"> | null, callbackError: string | null) {
  // An unsuccessful invitation can leave a different account signed in. Never
  // present its password setup as though it belonged to the failed invitation.
  return !callbackError && user?.user_metadata.needs_password_setup === true;
}

export function passwordSetupError(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your password.";
  if (password !== confirmation) return "The passwords do not match. Enter the same password twice.";
  return null;
}

type AccountAction = "signin" | "signup" | "password" | "profile" | "signout" | "session" | "invite";
const fallbackMessages: Record<AccountAction, string> = {
  signin: "We could not sign you in. Check your connection and try again.",
  signup: "We could not create your account. Try again shortly.",
  password: "Your password was not saved. Check your connection and try again.",
  profile: "Your profile was not saved. Try again.",
  signout: "We could not sign you out. Try again.",
  session: "We could not check your account. Refresh this page and try again.",
  invite: "We could not accept your invitation. Check your connection and try again.",
};

/** Only application-owned messages reach the screen, never provider URLs. */
export function accountActionError(error: unknown, action: AccountAction, inviteOnly = false) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  if (code === "invalid_credentials") return "The email or password was not recognized. Check both and try again.";
  if (code === "email_not_confirmed") return inviteOnly
    ? "Open your personal invitation link to finish setting up this account. Ask for a new link if it has expired."
    : "Confirm your email before signing in.";
  if (code === "otp_expired") return unusableAccountLinkMessage;
  if (["session_not_found", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "reauthentication_needed", "reauthentication_not_valid"].includes(code))
    return "Your sign-in needs to be refreshed. Sign in again, or ask the pilot organizer for account recovery if you have not set a password.";
  if (code === "weak_password") return "Choose a stronger password and try again.";
  if (code === "same_password") return "Choose a password different from your current password.";
  if (["over_request_rate_limit", "over_email_send_rate_limit", "request_timeout"].includes(code)) return "Please wait a moment, then try again.";
  return fallbackMessages[action];
}
