-- ============================================================
-- Splitwise Clone — Initial Schema Migration
-- Run this entire file in Supabase SQL Editor
-- Order matters: referenced tables must exist before FKs
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PROFILES (extends auth.users)
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   varchar(100) not null,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 2. GROUPS
-- ────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(100) not null,
  category        varchar(20) default 'other'
                  check (category in ('trip', 'home', 'work', 'other')),
  created_by      uuid references public.profiles on delete set null,
  simplify_debts  boolean default false,
  is_archived     boolean default false,
  created_at      timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 3. GROUP MEMBERS
-- ────────────────────────────────────────────────────────────
create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  role        varchar(10) default 'member'
              check (role in ('admin', 'member')),
  joined_at   timestamptz default now(),
  unique(group_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 4. EXPENSES
-- ────────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups on delete cascade,
  description  varchar(255) not null,
  amount       numeric(10,2) not null check (amount > 0),
  paid_by      uuid references public.profiles on delete set null,
  split_type   varchar(20) not null
               check (split_type in ('equal', 'exact', 'percentage', 'shares')),
  date         date not null default current_date,
  is_deleted   boolean default false,
  created_by   uuid references public.profiles on delete set null,
  created_at   timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 5. EXPENSE SPLITS
-- ────────────────────────────────────────────────────────────
create table if not exists public.expense_splits (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  paid_share   numeric(10,2) not null default 0 check (paid_share >= 0),
  amount_owed  numeric(10,2) not null default 0 check (amount_owed >= 0)
);

-- ────────────────────────────────────────────────────────────
-- 6. BALANCES (application-maintained, not a view)
-- ────────────────────────────────────────────────────────────
create table if not exists public.balances (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups on delete cascade,
  user_id         uuid not null references public.profiles on delete cascade,
  counterparty_id uuid not null references public.profiles on delete cascade,
  amount          numeric(10,2) not null default 0,
  updated_at      timestamptz default now(),
  -- Enforce canonical ordering: user_id < counterparty_id (UUID lexicographic)
  -- amount > 0 means user_id owes counterparty_id
  -- Flip sign at read time for reverse direction
  constraint canonical_order check (user_id::text < counterparty_id::text),
  unique(group_id, user_id, counterparty_id)
);

-- ────────────────────────────────────────────────────────────
-- 7. SETTLEMENTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  paid_by     uuid not null references public.profiles on delete cascade,
  paid_to     uuid not null references public.profiles on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  note        text,
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 8. EXPENSE COMMENTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.expense_comments (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  body        text not null check (length(body) > 0),
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 9. INDEXES (performance)
-- ────────────────────────────────────────────────────────────
create index if not exists idx_group_members_group_id   on public.group_members(group_id);
create index if not exists idx_group_members_user_id    on public.group_members(user_id);
create index if not exists idx_expenses_group_id        on public.expenses(group_id);
create index if not exists idx_expenses_is_deleted      on public.expenses(is_deleted);
create index if not exists idx_expense_splits_expense   on public.expense_splits(expense_id);
create index if not exists idx_expense_splits_user      on public.expense_splits(user_id);
create index if not exists idx_balances_group_id        on public.balances(group_id);
create index if not exists idx_balances_user_id         on public.balances(user_id);
create index if not exists idx_settlements_group_id     on public.settlements(group_id);
create index if not exists idx_comments_expense_id      on public.expense_comments(expense_id);

-- ────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY
-- Enable RLS but keep policies permissive for service-role key
-- FastAPI uses service role key — RLS is a safety net, not the auth layer
-- ────────────────────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.groups           enable row level security;
alter table public.group_members    enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_splits   enable row level security;
alter table public.balances         enable row level security;
alter table public.settlements      enable row level security;
alter table public.expense_comments enable row level security;

-- Allow authenticated users to read their own profile
create policy "users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Allow service role full access (FastAPI backend uses this)
-- The anon key only gets Realtime access for comments
create policy "service role full access profiles"
  on public.profiles for all
  using (auth.role() = 'service_role');

create policy "service role full access groups"
  on public.groups for all
  using (auth.role() = 'service_role');

create policy "service role full access group_members"
  on public.group_members for all
  using (auth.role() = 'service_role');

create policy "service role full access expenses"
  on public.expenses for all
  using (auth.role() = 'service_role');

create policy "service role full access splits"
  on public.expense_splits for all
  using (auth.role() = 'service_role');

create policy "service role full access balances"
  on public.balances for all
  using (auth.role() = 'service_role');

create policy "service role full access settlements"
  on public.settlements for all
  using (auth.role() = 'service_role');

create policy "service role full access comments"
  on public.expense_comments for all
  using (auth.role() = 'service_role');

-- Allow anon/authenticated to SELECT comments (for Realtime subscription)
create policy "authenticated users can view comments"
  on public.expense_comments for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can insert comments"
  on public.expense_comments for insert
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 11. REALTIME — enable for expense_comments only
-- ────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → Database → Replication
-- Or uncomment below (requires superuser):
-- alter publication supabase_realtime add table public.expense_comments;
