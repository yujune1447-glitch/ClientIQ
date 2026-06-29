-- Run in Supabase SQL editor after enabling pg_cron and pg_net extensions.
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running.

select cron.schedule(
  'weekly-brief',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/weekly-brief',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
