create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  app_score_id text not null,
  title text not null,
  score_type text not null check (score_type in ('treble', 'grand')),
  tempo integer not null check (tempo between 20 and 320),
  measure_count integer not null default 0 check (measure_count >= 0),
  score_json jsonb not null,
  schema_version text not null default 'sheetlab-score-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, app_score_id)
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  score_id uuid not null references public.scores (id) on delete cascade,
  mode text not null check (mode in ('listen', 'wait', 'rhythm')),
  hand_mode text not null check (hand_mode in ('left', 'right', 'both')),
  range_start_measure integer not null check (range_start_measure >= 1),
  range_end_measure integer not null check (range_end_measure >= 1),
  score_percent integer not null check (score_percent between 0 and 100),
  accuracy_percent integer not null check (accuracy_percent between 0 and 100),
  timing_score_percent integer check (timing_score_percent between 0 and 100),
  pedal_score_percent integer check (pedal_score_percent between 0 and 100),
  correct_count integer not null default 0 check (correct_count >= 0),
  target_count integer not null default 0 check (target_count >= 0),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  finished_at timestamptz not null default now()
);

create index if not exists profiles_updated_at_idx
  on public.profiles (updated_at desc);

create index if not exists scores_owner_updated_idx
  on public.scores (owner_id, updated_at desc)
  where deleted_at is null;

create index if not exists scores_owner_app_score_idx
  on public.scores (owner_id, app_score_id);

create index if not exists practice_attempts_owner_score_rank_idx
  on public.practice_attempts (
    owner_id,
    score_id,
    score_percent desc,
    accuracy_percent desc,
    finished_at desc
  );

alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.practice_attempts enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists scores_select_own on public.scores;
create policy scores_select_own
  on public.scores
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists scores_insert_own on public.scores;
create policy scores_insert_own
  on public.scores
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists scores_update_own on public.scores;
create policy scores_update_own
  on public.scores
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists scores_delete_own on public.scores;
create policy scores_delete_own
  on public.scores
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists practice_attempts_select_own on public.practice_attempts;
create policy practice_attempts_select_own
  on public.practice_attempts
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists practice_attempts_insert_own on public.practice_attempts;
create policy practice_attempts_insert_own
  on public.practice_attempts
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.scores
      where scores.id = score_id
        and scores.owner_id = (select auth.uid())
    )
  );

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
