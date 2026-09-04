-- Notifications: add performance indexes and enable Realtime subscriptions.
--
-- Indexes cover the two primary query patterns:
--   1. List all notifications for a user, newest first.
--   2. Count unread notifications for a user.
--
-- Realtime publication enables client INSERT subscriptions so the UI
-- can react to new notifications without polling.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Covers: SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC
create index if not exists idx_notifications_user_created
on public.notifications (user_id, created_at desc);

-- Partial index for unread count queries.
-- Covers: SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL
-- Smaller than a full index because it only stores rows where read_at IS NULL.
create index if not exists idx_notifications_user_unread
on public.notifications (user_id)
where read_at is null;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Enable Supabase Realtime so clients can subscribe to INSERT events
-- via supabase.channel() with a user_id filter.
alter publication supabase_realtime add table public.notifications;
