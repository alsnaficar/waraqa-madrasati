-- DB-level enforcement of the "one active pairing per teacher" invariant.
--
-- The application flow (`MadrasatiPairingService.start`) already revokes any
-- previous pending/paired pairing before inserting a new one, but that
-- ordering is a race window: two concurrent `start` calls for the same user
-- can both pass the revocation and insert two active rows. This partial
-- unique index closes the race atomically: at most one pending/paired row may
-- exist per user at any instant. A losing concurrent insert fails with a
-- unique-violation error (23505) instead of silently creating a second token
-- that would accept a claim.
--
-- Revoked and expired rows are intentionally excluded: history rows keep
-- accumulating so the teacher still sees prior lifecycle states in status.
--
-- NOT applied to Production — this migration ships as a file and will be
-- applied manually with other Phase 2 migrations.

create unique index if not exists idx_madrasati_pairings_one_active_per_user
on public.madrasati_pairings (user_id)
where status in ('pending', 'paired');