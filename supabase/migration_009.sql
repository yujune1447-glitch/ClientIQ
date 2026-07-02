create table if not exists saved_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  platform text not null,
  title text not null,
  hook text,
  length text,
  structure text,
  why_it_works text,
  status text not null default 'to_make' check (status in ('to_make', 'in_progress', 'done')),
  source text not null default 'ai' check (source in ('ai', 'manual')),
  source_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_ideas_user_platform on saved_ideas (user_id, platform);
create index if not exists saved_ideas_user_status on saved_ideas (user_id, status);
