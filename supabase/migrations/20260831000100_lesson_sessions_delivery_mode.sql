-- WARAQA — Daily lesson preparation delivery mode.
-- classroom = حضوري
-- remote    = عن بعد
-- Additive only. Existing sessions default to classroom.

alter table public.lesson_sessions
  add column if not exists delivery_mode text not null default 'classroom';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'lesson_sessions'
      and c.conname = 'lesson_sessions_delivery_mode_check'
  ) then
    alter table public.lesson_sessions
      add constraint lesson_sessions_delivery_mode_check
      check (delivery_mode in ('classroom', 'remote'));
  end if;
end;
$$;

comment on column public.lesson_sessions.delivery_mode is
  'Daily preparation delivery mode: classroom = حضوري, remote = عن بعد.';
