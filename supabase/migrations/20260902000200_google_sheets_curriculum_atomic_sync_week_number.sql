create or replace function public.sync_google_sheets_curriculum_atomic(
  p_user_id uuid,
  p_subject text,
  p_grade text,
  p_semester text,
  p_academic_year text,
  p_original_name text,
  p_lessons jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_id uuid;
  v_lesson jsonb;
  v_title text;
  v_lesson_date date;
  v_index integer := 0;
  v_count integer := 0;
  v_week_number integer;
begin
  if p_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.has_role(p_user_id, 'admin'::public.app_role) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_subject, '')), '') is null then
    raise exception 'MISSING_SUBJECT';
  end if;

  if nullif(trim(coalesce(p_grade, '')), '') is null then
    raise exception 'MISSING_GRADE';
  end if;

  if nullif(trim(coalesce(p_semester, '')), '') is null then
    raise exception 'MISSING_SEMESTER';
  end if;

  if p_lessons is null or jsonb_typeof(p_lessons) <> 'array' then
    raise exception 'INVALID_LESSONS_PAYLOAD';
  end if;

  if jsonb_array_length(p_lessons) = 0 then
    raise exception 'EMPTY_LESSONS';
  end if;

  -- Validate every lesson before mutation.
  for v_lesson in
    select value from jsonb_array_elements(p_lessons)
  loop
    v_title := nullif(trim(coalesce(v_lesson->>'lessonTitle', '')), '');
    if nullif(trim(coalesce(v_lesson->>'weekNumber', '')), '') is not null then
      begin
        v_week_number := (v_lesson->>'weekNumber')::integer;
      exception when others then
        raise exception 'INVALID_WEEK_NUMBER';
      end;
      if v_week_number < 1 then
        raise exception 'INVALID_WEEK_NUMBER';
      end if;
    end if;

    if v_title is null then
      raise exception 'MISSING_LESSON_TITLE';
    end if;

    if nullif(trim(coalesce(v_lesson->>'lessonDate', '')), '') is not null then
      begin
        v_lesson_date := (v_lesson->>'lessonDate')::date;
      exception when others then
        raise exception 'INVALID_LESSON_DATE';
      end;
    end if;
  end loop;

  -- Serialize concurrent syncs for the same curriculum.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'google-sheets-curriculum|' ||
      trim(p_subject) || '|' ||
      trim(p_grade) || '|' ||
      trim(p_semester) || '|' ||
      trim(coalesce(p_academic_year, '')),
      0
    )
  );


  -- Reuse only an existing draft.
  select id
    into v_file_id
    from public.curriculum_files
   where user_id = p_user_id
     and subject = trim(p_subject)
     and grade = trim(p_grade)
     and semester = trim(p_semester)
     and status = 'draft'
   order by updated_at desc, created_at desc
   limit 1
   for update;

  if v_file_id is null then
    -- Never reuse a published or archived curriculum.
    insert into public.curriculum_files (
      user_id,
      subject,
      grade,
      semester,
      academic_year,
      original_name,
      mime_type,
      size_bytes,
      storage_path,
      status
    )
    values (
      p_user_id,
      trim(p_subject),
      trim(p_grade),
      trim(p_semester),
      nullif(trim(coalesce(p_academic_year, '')), ''),
      coalesce(
        nullif(trim(coalesce(p_original_name, '')), ''),
        'Google Sheets Curriculum'
      ),
      'application/vnd.google-apps.spreadsheet',
      0,
      'google-sheet',
      'draft'
    )
    returning id into v_file_id;
  else
    update public.curriculum_files
       set academic_year = nullif(trim(coalesce(p_academic_year, '')), ''),
           original_name = coalesce(
             nullif(trim(coalesce(p_original_name, '')), ''),
             original_name
           ),
           mime_type = 'application/vnd.google-apps.spreadsheet',
           storage_path = 'google-sheet',
           updated_at = now()
     where id = v_file_id
       and status = 'draft';
  end if;




  -- Replace lessons only for the draft selected above.
  delete from public.curriculum_lessons
   where curriculum_file_id = v_file_id;

  for v_lesson in
    select value from jsonb_array_elements(p_lessons)
  loop
    v_title := trim(v_lesson->>'lessonTitle');
    v_lesson_date := null;

    if nullif(trim(coalesce(v_lesson->>'lessonDate', '')), '') is not null then
      v_lesson_date := (v_lesson->>'lessonDate')::date;
    end if;

    insert into public.curriculum_lessons (
      curriculum_file_id,
      title,
      objectives,
      notes,
      order_index,
      week_number,
      lesson_date,
      user_id
    )
    values (
      v_file_id,
      v_title,
      nullif(trim(coalesce(v_lesson->>'objectives', '')), ''),
      coalesce(
        nullif(trim(coalesce(v_lesson->>'notes', '')), ''),
        nullif(trim(coalesce(v_lesson->>'unitTitle', '')), '')
      ),
      v_index,
      nullif(trim(coalesce(v_lesson->>'weekNumber', '')), '')::integer,
      v_lesson_date,
      p_user_id
    );

    v_index := v_index + 1;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'file_id', v_file_id,
    'lessons_written', v_count
  );
end;
$$;

revoke all on function public.sync_google_sheets_curriculum_atomic(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.sync_google_sheets_curriculum_atomic(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
