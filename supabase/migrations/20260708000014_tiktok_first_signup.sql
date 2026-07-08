-- Allow TikTok-first signup: a user can exist without a Google identity, keyed
-- instead by their TikTok open_id. TikTok's user.info.* scopes provide no email,
-- so open_id is the stable identifier (mirrors the google_id pattern).

alter table users alter column google_id drop not null;

alter table users add column if not exists tiktok_open_id text;

-- Unique so onConflict("tiktok_open_id") works. NULLs are distinct in Postgres,
-- so YouTube-only users (tiktok_open_id NULL) and TikTok-only users (google_id
-- NULL) never collide.
create unique index if not exists users_tiktok_open_id_key on users (tiktok_open_id);
