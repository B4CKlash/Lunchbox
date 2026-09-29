import { householdStateSchema, type HouseholdState } from "@/lib/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveAccountKitchen(client: SupabaseClient, state: HouseholdState) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in before saving your kitchen.");
  const result = await client.from("account_kitchens").upsert({
    user_id: data.user.id,
    state: householdStateSchema.parse(state),
    updated_at: new Date().toISOString(),
  });
  if (result.error) throw new Error("Your kitchen could not be saved. Please try again.");
}

export async function loadAccountKitchen(client: SupabaseClient): Promise<HouseholdState | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in before loading your kitchen.");
  const result = await client.from("account_kitchens").select("state")
    .eq("user_id", data.user.id).maybeSingle();
  if (result.error) throw new Error("Your kitchen could not be loaded. Please try again.");
  if (!result.data) return null;
  const parsed = householdStateSchema.safeParse(result.data.state);
  if (!parsed.success) throw new Error("This saved kitchen is incompatible. Your current kitchen has been kept.");
  return parsed.data;
}
