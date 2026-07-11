import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-admin";
import { stripePeriodEndISO } from "@/lib/subscription";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const userId = request.cookies.get("user_id")?.value;

  // The Stripe customer is tied to the user_id cookie, so the user must connect a
  // channel (which creates their account) before they can start a trial.
  if (!userId) return NextResponse.redirect(`${appUrl}/api/auth/youtube`);

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) return NextResponse.redirect(`${appUrl}/?error=billing_unconfigured`);

  const stripe = getStripe();
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("email, stripe_customer_id, subscription_status")
    .eq("id", userId)
    .single();

  // Already entitled → skip checkout, go to their brief flow.
  if (user?.subscription_status === "trialing" || user?.subscription_status === "active") {
    return NextResponse.redirect(`${appUrl}/analyzing`);
  }

  let customerId = user?.stripe_customer_id ?? null;

  // If a customer already exists, reconcile with Stripe first. This covers webhook
  // lag right after a successful checkout (and any missed webhook), preventing a
  // redirect loop or a duplicate subscription.
  if (customerId) {
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 3 });
    const active = subs.data.find((s) => s.status === "trialing" || s.status === "active");
    if (active) {
      await supabase
        .from("users")
        .update({
          stripe_subscription_id: active.id,
          subscription_status: active.status,
          current_period_end: stripePeriodEndISO(active),
        })
        .eq("id", userId);
      return NextResponse.redirect(`${appUrl}/analyzing`);
    }
  } else {
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
    await supabase.from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { user_id: userId },
    },
    // Require a card up front even though the trial doesn't charge immediately.
    payment_method_collection: "always",
    success_url: `${appUrl}/analyzing?checkout=success`,
    cancel_url: `${appUrl}/?checkout=cancelled`,
  });

  if (!session.url) return NextResponse.redirect(`${appUrl}/?error=checkout_failed`);
  return NextResponse.redirect(session.url, { status: 303 });
}
