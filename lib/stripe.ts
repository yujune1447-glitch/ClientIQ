import Stripe from "stripe";

// Lazy singleton: the Stripe constructor throws on a missing key, and Next imports
// route modules at build time — so we defer construction to first request instead
// of instantiating at module top-level.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}
