-- Stripe subscription state on the user (14-day card-secured trial + monthly plan).
alter table users add column if not exists stripe_customer_id text;
alter table users add column if not exists stripe_subscription_id text;
alter table users add column if not exists subscription_status text;
alter table users add column if not exists current_period_end timestamptz;

create index if not exists users_stripe_customer_id_idx on users (stripe_customer_id);
