import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-admin";
import { stripePeriodEndISO } from "@/lib/subscription";

type Supabase = ReturnType<typeof createAdminClient>;

async function persistSubscription(
  supabase: Supabase,
  userId: string | null,
  customerId: string | null,
  sub: Stripe.Subscription,
): Promise<void> {
  const update = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: stripePeriodEndISO(sub),
    updated_at: new Date().toISOString(),
  };
  // Prefer the explicit user_id from metadata/reference; fall back to the customer.
  if (userId) {
    await supabase.from("users").update(update).eq("id", userId);
  } else if (customerId) {
    await supabase.from("users").update(update).eq("stripe_customer_id", customerId);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  const body = await request.text(); // raw body required for signature verification

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await persistSubscription(supabase, userId, customerId, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const userId = sub.metadata?.user_id ?? null;
        await persistSubscription(supabase, userId, customerId, sub);
        break;
      }
    }
  } catch (err) {
    // Log and 200 so Stripe doesn't retry-storm over our internal DB hiccups.
    console.error("[stripe-webhook] handler error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true, error: "handler_failed" });
  }

  return NextResponse.json({ received: true });
}
