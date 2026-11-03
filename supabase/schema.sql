-- Database schema (already applied to Supabase project "korean-flashcards").
-- To set up a fresh project: paste this into the Supabase SQL editor and run it.

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders (id) on delete cascade,
  seq bigint generated always as identity,
  ko text not null check (char_length(ko) between 1 and 200),
  rom text not null default '' check (char_length(rom) <= 200),
  tr text not null check (char_length(tr) between 1 and 300),
  good integer not null default 0 check (good >= 0),
  bad integer not null default 0 check (bad >= 0),
  box smallint not null default 0 check (box between 0 and 5),
  last_seen timestamptz,
  constraint cards_folder_word_unique unique (folder_id, ko, tr)
);
create index cards_folder_seq_idx on public.cards (folder_id, seq);

create table public.sessions (
  id bigint generated always as identity primary key,
  folder_id uuid not null references public.folders (id) on delete cascade,
  at timestamptz not null default now(),
  mode text not null default 'cards' check (mode in ('cards', 'match', 'test', 'write', 'listen', 'review')),
  total integer not null check (total >= 0),
  good integer not null check (good >= 0),
  bad integer not null check (bad >= 0)
);
create index sessions_folder_at_idx on public.sessions (folder_id, at);

-- Each row belongs to the signed-in user who created it (filled in automatically from the login).
alter table public.folders add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
alter table public.cards add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
alter table public.sessions add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
create index folders_user_idx on public.folders (user_id);
create index cards_user_idx on public.cards (user_id);
create index sessions_user_idx on public.sessions (user_id);

-- Row-level security: a signed-in user only sees and changes their own rows; anonymous visitors see nothing.
alter table public.folders enable row level security;
alter table public.cards enable row level security;
alter table public.sessions enable row level security;

create policy "own folders" on public.folders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own cards" on public.cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid()))
  );

create policy "own sessions" on public.sessions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.folders, public.cards, public.sessions to authenticated;

-- One practice answer, applied atomically. Leitner box: correct moves up (max 5), wrong drops to 0.
create function public.record_answer(p_folder uuid, p_card uuid, p_good boolean)
returns public.cards
language sql
security invoker
set search_path = ''
as $$
  update public.cards set
    good = good + case when p_good then 1 else 0 end,
    bad = bad + case when p_good then 0 else 1 end,
    box = case when p_good then least(5, box + 1) else 0 end,
    last_seen = now()
  where id = p_card and folder_id = p_folder
  returning *;
$$;
revoke execute on function public.record_answer(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_answer(uuid, uuid, boolean) to authenticated, service_role;

-- Spaced repetition state, one row per word per direction:
--   rec = recognize (Korean -> meaning), pro = produce (meaning -> Korean).
create table public.reviews (
  card_id uuid not null references public.cards (id) on delete cascade,
  dir text not null check (dir in ('rec', 'pro')),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  due timestamptz not null,
  interval_days real not null default 0 check (interval_days >= 0),
  ease real not null default 2.5 check (ease >= 1.3),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_review timestamptz,
  created_at timestamptz not null default now(),
  primary key (card_id, dir)
);
create index reviews_user_due_idx on public.reviews (user_id, due);

alter table public.reviews enable row level security;
create policy "own reviews" on public.reviews for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.cards c where c.id = card_id and c.user_id = (select auth.uid()))
  );
grant select, insert, update, delete on public.reviews to authenticated;

-- One review, applied atomically (SM-2 style). Grades: 1 again, 2 hard, 3 good, 4 easy.
-- "Again" resets the streak and brings the word back in a minute; the others push the next review out.
create function public.record_review(p_card uuid, p_dir text, p_grade integer)
returns public.reviews
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.reviews;
  v_interval real;
  v_ease real;
  v_reps integer;
  v_lapses integer;
begin
  if p_dir not in ('rec', 'pro') or p_grade not between 1 and 4 then
    raise exception 'invalid review' using errcode = '22023';
  end if;

  select * into r from public.reviews where card_id = p_card and dir = p_dir for update;
  v_interval := coalesce(r.interval_days, 0);
  v_ease := coalesce(r.ease, 2.5);
  v_reps := coalesce(r.reps, 0);
  v_lapses := coalesce(r.lapses, 0);

  if p_grade = 1 then
    v_lapses := v_lapses + case when v_reps > 0 then 1 else 0 end;
    v_reps := 0;
    v_interval := 0;
    v_ease := greatest(1.3, v_ease - 0.2);
  elsif p_grade = 2 then
    v_interval := case when v_reps = 0 then 1 else greatest(1, v_interval * 1.2) end;
    v_ease := greatest(1.3, v_ease - 0.15);
    v_reps := v_reps + 1;
  elsif p_grade = 3 then
    v_interval := case when v_reps = 0 then 1 when v_reps = 1 then 3 else v_interval * v_ease end;
    v_reps := v_reps + 1;
  else
    v_interval := case when v_reps = 0 then 4 else greatest(4, v_interval * v_ease * 1.3) end;
    v_ease := v_ease + 0.15;
    v_reps := v_reps + 1;
  end if;
  v_interval := least(v_interval, 365);

  insert into public.reviews (card_id, dir, due, interval_days, ease, reps, lapses, last_review)
  values (
    p_card, p_dir,
    now() + case when p_grade = 1 then interval '1 minute' else make_interval(secs => v_interval * 86400) end,
    v_interval, v_ease, v_reps, v_lapses, now()
  )
  on conflict (card_id, dir) do update set
    due = excluded.due,
    interval_days = excluded.interval_days,
    ease = excluded.ease,
    reps = excluded.reps,
    lapses = excluded.lapses,
    last_review = excluded.last_review
  returning * into r;
  return r;
end;
$$;
revoke execute on function public.record_review(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.record_review(uuid, text, integer) to authenticated, service_role;
