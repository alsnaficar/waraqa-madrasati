-- Atomic Madrasati timetable apply.
--
-- The authenticated Waraqa user is always derived from auth.uid().
-- The RPC replaces the user's complete weekly timetable in one transaction.
-- lesson_sessions are never touched.

create or replace function public.apply_madrasati_timetable_atomic(
  p_entries jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry jsonb;
  v_count integer := 0;
  v_day smallint;
  v_period smallint;
  v_subject text;
  v_grade text;
  v_class_name text;
  v_classroom text;
  v_starts_at time;
  v_ends_at time;
  v_seen text[] := '{}';
  v_key text;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'INVALID_TIMETABLE_PAYLOAD';
  end if;

  -- Validate every row before deleting anything.
  for v_entry in
    select value
    from jsonb_array_elements(p_entries)
  loop
    v_day := nullif(v_entry->>'dayOfWeek', '')::smallint;
    v_period := nullif(v_entry->>'period', '')::smallint;
    v_subject := nullif(trim(coalesce(v_entry->>'subject', '')), '');
    v_grade := nullif(trim(coalesce(v_entry->>'grade', '')), '');
    v_class_name := nullif(trim(coalesce(v_entry->>'className', '')), '');
    v_classroom := nullif(trim(coalesce(v_entry->>'classroom', '')), '');
    v_starts_at := nullif(v_entry->>'startsAt', '')::time;
    v_ends_at := nullif(v_entry->>'endsAt', '')::time;

    if v_day is null or v_day < 0 or v_day > 6 then
      raise exception 'INVALID_DAY_OF_WEEK';
    end if;

    if v_period is null or v_period < 1 or v_period > 12 then
      raise exception 'INVALID_PERIOD';
    end if;

    if v_subject is null then
      raise exception 'MISSING_SUBJECT';
    end if;

    if v_grade is null then
      raise exception 'MISSING_GRADE';
    end if;

    if v_class_name is null then
      raise exception 'MISSING_CLASS';
    end if;

    v_key := v_day::text || '|' || v_period::text;

    if v_key = any(v_seen) then
      raise exception 'DUPLICATE_TIMETABLE_SLOT';
    end if;

    v_seen := array_append(v_seen, v_key);
  end loop;

  -- Empty snapshots are intentionally rejected.
  if jsonb_array_length(p_entries) = 0 then
    raise exception 'EMPTY_TIMETABLE';
  end if;

  -- Lock the caller's current timetable before replacement.
  perform 1
    from public.teacher_timetable
   where teacher_id = v_user_id
   for update;

  delete from public.teacher_timetable
   where teacher_id = v_user_id;

  for v_entry in
    select value
    from jsonb_array_elements(p_entries)
  loop
    v_day := (v_entry->>'dayOfWeek')::smallint;
    v_period := (v_entry->>'period')::smallint;
    v_subject := trim(v_entry->>'subject');
    v_grade := trim(v_entry->>'grade');
    v_class_name := trim(v_entry->>'className');
    v_classroom := nullif(trim(coalesce(v_entry->>'classroom', '')), '');
    v_starts_at := nullif(v_entry->>'startsAt', '')::time;
    v_ends_at := nullif(v_entry->>'endsAt', '')::time;

    insert into public.teacher_timetable (
      teacher_id,
      day_of_week,
      period,
      subject,
      grade,
      class_name,
      classroom,
      starts_at,
      ends_at,
      active
    )
    values (
      v_user_id,
      v_day,
      v_period,
      v_subject,
      v_grade,
      v_class_name,
      v_classroom,
      v_starts_at,
      v_ends_at,
      true
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'slots_written', v_count,
    'teacher_id', v_user_id
  );
end;
$$;

revoke all on function public.apply_madrasati_timetable_atomic(jsonb)
  from public, anon;

grant execute on function public.apply_madrasati_timetable_atomic(jsonb)
  to authenticated;
