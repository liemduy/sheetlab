create table if not exists public.score_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  score_id uuid not null references public.scores (id) on delete cascade,
  app_score_id text not null,
  title text not null,
  score_json jsonb not null,
  version_number integer not null check (version_number >= 1),
  created_at timestamptz not null default now(),
  unique (score_id, version_number)
);

create table if not exists public.score_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  score_id uuid not null references public.scores (id) on delete cascade,
  token text not null unique default replace(
    replace(
      trim(trailing '=' from encode(gen_random_bytes(18), 'base64')),
      '+',
      '-'
    ),
    '/',
    '_'
  ),
  permission text not null default 'view' check (permission in ('view')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists score_versions_score_created_idx
  on public.score_versions (score_id, created_at desc);

create index if not exists score_versions_owner_created_idx
  on public.score_versions (owner_id, created_at desc);

create index if not exists score_share_links_owner_score_idx
  on public.score_share_links (owner_id, score_id, created_at desc)
  where revoked_at is null;

create index if not exists score_share_links_token_active_idx
  on public.score_share_links (token)
  where revoked_at is null;

alter table public.score_versions enable row level security;
alter table public.score_share_links enable row level security;

drop policy if exists score_versions_select_own on public.score_versions;
create policy score_versions_select_own
  on public.score_versions
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists score_versions_insert_own on public.score_versions;
create policy score_versions_insert_own
  on public.score_versions
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists score_share_links_select_own on public.score_share_links;
create policy score_share_links_select_own
  on public.score_share_links
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists score_share_links_insert_own on public.score_share_links;
create policy score_share_links_insert_own
  on public.score_share_links
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

drop policy if exists score_share_links_update_own on public.score_share_links;
create policy score_share_links_update_own
  on public.score_share_links
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists score_share_links_public_read_active on public.score_share_links;
create policy score_share_links_public_read_active
  on public.score_share_links
  for select
  to anon
  using (
    revoked_at is null
    and (expires_at is null or expires_at > now())
  );

create or replace function public.capture_score_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if tg_op = 'UPDATE' and old.score_json = new.score_json then
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1
    into next_version
    from public.score_versions
    where score_id = new.id;

  insert into public.score_versions (
    owner_id,
    score_id,
    app_score_id,
    title,
    score_json,
    version_number
  )
  values (
    new.owner_id,
    new.id,
    new.app_score_id,
    new.title,
    new.score_json,
    next_version
  );

  return new;
end;
$$;

drop trigger if exists scores_capture_version on public.scores;
create trigger scores_capture_version
  after insert or update of score_json on public.scores
  for each row execute procedure public.capture_score_version();
