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
  mode text not null default 'cards' check (mode in ('cards', 'match', 'test')),
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
