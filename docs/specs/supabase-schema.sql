-- ============================================================================
-- ContractIQ — Supabase Schema
-- Paste this entire file into the Supabase SQL Editor and run on a fresh
-- project. Safe to re-run (all statements are idempotent).
-- Source: docs/engineering/engineering-doc.md, sections 7 and 8.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Shared trigger function: auto-update updated_at
-- ----------------------------------------------------------------------------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- Table: contracts
-- ============================================================================
create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  file_name     text not null,
  file_path     text,
  contract_type text not null check (contract_type in ('nda', 'msa')),
  contract_text text not null,
  status        text not null default 'uploading'
                  check (status in ('uploading', 'ready', 'processing', 'complete', 'error')),
  page_count    integer not null,
  token_count   integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_contracts_user_id on contracts (user_id);
create index if not exists idx_contracts_created_at on contracts (user_id, created_at desc);

drop trigger if exists set_updated_at on contracts;
create trigger set_updated_at
  before update on contracts
  for each row execute function update_updated_at();

alter table contracts enable row level security;

drop policy if exists "users_own_contracts" on contracts;
create policy "users_own_contracts" on contracts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Table: key_terms
-- ============================================================================
create table if not exists key_terms (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid not null references contracts(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  term_name         text not null,
  value             text,
  original_value    text,
  page_number       integer,
  confidence_score  numeric(5,2) not null check (confidence_score between 0 and 100),
  source_sentence   text,
  is_custom         boolean not null default false,
  is_edited         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_key_terms_contract_id on key_terms (contract_id);
create index if not exists idx_key_terms_user_id on key_terms (user_id);

drop trigger if exists set_updated_at on key_terms;
create trigger set_updated_at
  before update on key_terms
  for each row execute function update_updated_at();

alter table key_terms enable row level security;

drop policy if exists "users_own_key_terms" on key_terms;
create policy "users_own_key_terms" on key_terms
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Table: custom_key_terms
-- ============================================================================
create table if not exists custom_key_terms (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  term_name   text not null,
  is_manual   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_custom_key_terms_contract_id on custom_key_terms (contract_id);

alter table custom_key_terms enable row level security;

drop policy if exists "users_own_custom_terms" on custom_key_terms;
create policy "users_own_custom_terms" on custom_key_terms
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Max 5 custom terms per contract (defense in depth; also enforced at API layer)
create or replace function enforce_max_custom_terms()
returns trigger as $$
begin
  if (select count(*) from custom_key_terms where contract_id = new.contract_id) >= 5 then
    raise exception 'Maximum 5 custom terms per contract';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_max_custom_terms on custom_key_terms;
create trigger trg_max_custom_terms
  before insert on custom_key_terms
  for each row execute function enforce_max_custom_terms();

-- ============================================================================
-- Table: chat_sessions
-- ============================================================================
create table if not exists chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references contracts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_chat_sessions_contract_id on chat_sessions (contract_id);

alter table chat_sessions enable row level security;

drop policy if exists "users_own_chat_sessions" on chat_sessions;
create policy "users_own_chat_sessions" on chat_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Table: chat_messages
-- ============================================================================
create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references chat_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  -- Query classification from the conversation memory layer (docs/specs/06
  -- §4). Set on assistant messages only; null for user messages.
  source_type text check (source_type in ('contract', 'history', 'both')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_chat_messages_session_id on chat_messages (session_id, created_at asc);

alter table chat_messages enable row level security;

drop policy if exists "users_own_chat_messages" on chat_messages;
create policy "users_own_chat_messages" on chat_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Table: user_feedback
-- ============================================================================
create table if not exists user_feedback (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references contracts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rating      text not null check (rating in ('thumbs_up', 'thumbs_down')),
  comment     text check (char_length(comment) <= 1000),
  created_at  timestamptz not null default now()
);

alter table user_feedback enable row level security;

drop policy if exists "users_own_feedback" on user_feedback;
create policy "users_own_feedback" on user_feedback
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Storage: contracts bucket + RLS
-- File path pattern: contracts/{user_id}/{contract_id}/{filename}.pdf
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

drop policy if exists "users_can_upload_own_contracts" on storage.objects;
create policy "users_can_upload_own_contracts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_can_read_own_contracts" on storage.objects;
create policy "users_can_read_own_contracts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_can_delete_own_contracts" on storage.objects;
create policy "users_can_delete_own_contracts" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- End of schema
-- ============================================================================
