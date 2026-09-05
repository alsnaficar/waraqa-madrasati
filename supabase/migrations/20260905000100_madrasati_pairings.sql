-- Madrasati Extension ↔ Waragh pairing records.
--
-- Stores only a SHA-256 hash of the pairing token — never the token itself.
-- The raw token is shown exactly once to the authenticated teacher and later
-- presented by the extension to claim the pairing. There is one active
-- pairing per teacher: starting a new pairing revokes any previous
-- pending/paired one (stale tokens stop working immediately).
--
-- No Madrasati credentials (password, cookies, or Madrasati session tokens)
-- are ever stored here.

create table if not exists public.madrasati_pairings (
    id uuid primary key default gen_random_uuid(),

    -- Owner is always derived server-side from the authenticated Waraqa
    -- session (or from token possession for the extension claim path) —
    -- never from client input.
    user_id uuid not null references auth.users(id) on delete cascade,

    -- sha256 hex digest of the pairing token. The token itself is never
    -- persisted and never returned again after pairing start.
    token_hash text not null unique,

    status text not null default 'pending'
        check (status in ('pending', 'paired', 'revoked', 'expired')),

    created_at timestamptz not null default now(),

    -- Claim deadline. A pending pairing past this time is treated as
    -- 'expired' and can never be claimed.
    expires_at timestamptz not null,

    paired_at timestamptz,
    revoked_at timestamptz,
    last_used_at timestamptz
);

grant select, insert, update
on public.madrasati_pairings
to authenticated;

grant all
on public.madrasati_pairings
to service_role;

alter table public.madrasati_pairings
enable row level security;

-- Owner-only RLS. The extension handshake (claim) runs with the
-- service-role client because no Waragh session exists at that boundary —
-- access is gated purely by possession of the high-entropy pairing token.
create policy "madrasati pairing owner"
on public.madrasati_pairings
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists idx_madrasati_pairings_user
on public.madrasati_pairings (user_id, created_at desc);

create index if not exists idx_madrasati_pairings_token_hash
on public.madrasati_pairings (token_hash);