import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase-admin";

export interface UserSubscription {
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
}

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("email, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end")
    .eq("id", userId)
    .single();
  if (!data) return null;
  return {
    email: data.email ?? null,
    stripeCustomerId: data.stripe_customer_id ?? null,
    stripeSubscriptionId: data.stripe_subscription_id ?? null,
    status: data.subscription_status ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
  };
}

// Access is granted while the subscription is trialing or fully active.
export function hasActiveAccess(status: string | null | undefined): boolean {
  return status === "trialing" || status === "active";
}

// The billing-period end moved from the Subscription object to its items across
// recent Stripe API versions — read whichever is present so it works either way.
export function stripePeriodEndISO(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as {
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  const secs = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
}
