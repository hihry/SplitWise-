# AI_CONTEXT.md — Splitwise Clone: Source of Truth

> This file is the canonical source of truth for the entire project.
> Every architectural decision, schema change, API payload change, skipped feature, or tradeoff must be logged here immediately.
> Code must never diverge from this file. If it does, this file wins.
> An evaluator must be able to reconstruct the entire app from this file alone.

---

## 1. Project Overview

**Assignment:** Reverse-engineer Splitwise, scope a realistic 3-day version, and build a working deployed app.
**Evaluator goal:** Reconstruct the app from this file alone. Every decision — including what was skipped and why — must be logged here.
**Standout feature:** Greedy min-transactions settlement algorithm (not naive pairwise balances).
**Stack:** Next.js 14 + FastAPI + Supabase (Postgres + Auth + Realtime)

---

## 2. Product Goals

- End-to-end execution: working deployed URL with real features.
- Algorithmic and data rigor: relational DB, correct split logic, penny-rounding handled explicitly.
- AI_CONTEXT.md must stay in sync with code at all times. Inconsistency = broken project.

---

## 3. Core Workflows (Non-Negotiable)

| # | Workflow | Notes |
|---|---|---|
| 1 | Expense creation with split calculation | Computed instantly, penny rounding handled |
| 2 | Group membership | Add by email lookup, remove with balance guard |
| 3 | Net balance tracking | Updates immediately on every expense mutation |
| 4 | Group context | Expenses scoped to groups, split only with members |
| 5 | Settle up | Records payment, triggers balance recalculation |
| 6 | Expense chat | Real-time comments via Supabase Realtime |
| 7 | Auth | Supabase Auth, JWT verified locally in FastAPI |

---

## 4. Out-of-Scope Features (Explicitly Skipped)

| Feature | Reason skipped |
|---|---|
| Email notifications | No email service, zero evaluation value |
| Avatar image upload | `avatar_url` column exists, stays null |
| Multi-currency | Single currency (INR ₹) only |
| Recurring expenses | Out of scope |
| CSV/PDF export | Out of scope |
| Mobile app | Web only |
| Invite via link | Email lookup only — direct add |
| Infinite scroll / pagination | Last 50 expenses, `offset` param exists but UI ignores it |
| Expense reactions | Comments are append-only text |

---

## 5. Split Types

All four supported. UI: single expense creation modal with tabbed interface.

```
[Equal] [Exact] [Percentage] [Shares]
```

### Tab Behavior

| Tab | User Input | Validation | Rounding |
|---|---|---|---|
| Equal | None | Auto | Last person (sorted by user_id asc) absorbs penny remainder |
| Exact | Amount per member | `sum === total` ± 0.01, submit disabled until valid | N/A |
| Percentage | % per member | `sum === 100` ± 0.01, submit disabled until valid | N/A |
| Shares | Integer per member (> 0) | All > 0 | `(shares / total_shares) * amount`, real-time preview |

### Penny Rounding Rule (Equal Split)
```python
base = floor(amount / n * 100) / 100   # truncate to 2 decimal places
remainder = amount - (base * n)         # always positive
splits = [base] * n
splits[-1] += round(remainder, 2)       # last person absorbs
# "last person" = last in array sorted by user_id ascending (deterministic)
```
Example: ₹100 ÷ 3 = [₹33.33, ₹33.33, ₹33.34]

### paid_share vs amount_owed
Critical schema insight — the payer can also owe a share:
- `paid_share`: what this person actually paid toward the expense
- `amount_owed`: what this person owes toward the expense
- Net contribution = `paid_share - amount_owed`
- Example: I pay ₹300 for 3 people equally → `paid_share=300, amount_owed=100` → net = +₹200

### Frontend vs Backend Responsibility
- **Frontend** computes all split amounts before submission.
- **Backend** validates and stores only. Does not recalculate.
- Backend validation: `sum(paid_share) == amount ± 0.01`, `sum(amount_owed) == amount ± 0.01`, all user_ids are group members.

---

## 6. Data Model

### Design Principles
- Read performance over write complexity.
- Balances table is application-maintained (not a Postgres materialized view).
- Settlements are a separate table from expenses (not `is_payment = true` flag).
- All balance recalculation goes through a single `recalculate_balances(group_id)` Python function.
- Migrations: plain `.sql` files run directly on Supabase. No Alembic.

---

### profiles
```sql
profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  varchar(100) not null,
  avatar_url text,
  created_at timestamptz default now()
)
```
Auto-created via trigger on `auth.users` insert:
```sql
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

### groups
```sql
groups (
  id             uuid primary key default gen_random_uuid(),
  name           varchar(100) not null,
  category       varchar(20) default 'other',  -- trip/home/work/other
  created_by     uuid references profiles,
  simplify_debts boolean default false,
  is_archived    boolean default false,
  created_at     timestamptz default now()
)
```
- `is_archived`: soft delete. Archived groups hidden from dashboard, balances remain queryable.
- `category`: drives UI icons only. No extra logic.
- `simplify_debts`: toggles greedy algorithm view on Settle Up screen.

---

### group_members
```sql
group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid references groups on delete cascade,
  user_id   uuid references profiles on delete cascade,
  role      varchar(10) default 'member',  -- admin/member
  joined_at timestamptz default now(),
  unique(group_id, user_id)
)
```
- `role`: admin can remove members, archive group, toggle simplify_debts.
- No invite flow, no pending status. Users added directly by email lookup.

---

### expenses
```sql
expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references groups on delete cascade,
  description varchar(255) not null,
  amount      numeric(10,2) not null,
  paid_by     uuid references profiles,
  split_type  varchar(20) not null,  -- equal/exact/percentage/shares
  date        date not null default current_date,
  is_deleted  boolean default false,
  created_by  uuid references profiles,
  created_at  timestamptz default now()
)
```
- `date` separate from `created_at`: user may log yesterday's expense today.
- `split_type` stored: needed to reconstruct split when editing.
- `is_deleted`: soft delete. Hard deletes make balance recalculation history unreliable.

---

### expense_splits
```sql
expense_splits (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid references expenses on delete cascade,
  user_id      uuid references profiles,
  paid_share   numeric(10,2) not null default 0,
  amount_owed  numeric(10,2) not null default 0
)
```

---

### balances
```sql
balances (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid references groups on delete cascade,
  user_id         uuid references profiles,       -- debtor
  counterparty_id uuid references profiles,       -- creditor
  amount          numeric(10,2) default 0,
  updated_at      timestamptz default now(),
  unique(group_id, user_id, counterparty_id)
)
```
**Direction:** `amount > 0` means `user_id` owes `counterparty_id` that amount.
**Canonical ordering constraint:** Always store with `user_id < counterparty_id` (UUID lexicographic). Never two rows per pair — flip sign at read time for the reverse direction.
```sql
alter table balances add constraint canonical_order check (user_id < counterparty_id);
```

---

### settlements
```sql
settlements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups on delete cascade,
  paid_by    uuid references profiles,
  paid_to    uuid references profiles,
  amount     numeric(10,2) not null,
  note       text,
  created_at timestamptz default now()
)
```
After insert → call `recalculate_balances(group_id)`.

---

### expense_comments
```sql
expense_comments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid references expenses on delete cascade,
  user_id    uuid references profiles,
  body       text not null,
  created_at timestamptz default now()
)
```
- Append-only. No edit, no delete, no reactions.
- Only `INSERT` events handled in Realtime subscription.

---

## 7. Settlement & Balance Calculation

### recalculate_balances(group_id)
Python function in `expenses/service.py`. Called explicitly after every:
- Expense create
- Expense edit
- Expense delete
- Settlement insert

Steps:
1. Zero out existing balance rows for the group
2. Query `expense_splits` joined to `expenses` where `is_deleted = false`, sum `paid_share - amount_owed` per user
3. Subtract confirmed settlements (paid_by, paid_to, amount)
4. For each non-zero net pair, upsert into `balances` with canonical ordering
5. Entire operation wrapped in a single DB transaction

### Concurrency Risk & Mitigation
Risk: two concurrent expense additions both call `recalculate_balances` — second write overwrites first's calculation incorrectly.

Mitigation: Postgres advisory lock per group:
```python
await db.execute(
    text("SELECT pg_advisory_xact_lock(:gid)"),
    {"gid": hash(group_id) % (2**31)}  # fit into int4
)
```
Serializes balance recalculation per group without locking the entire table.

### Greedy Min-Transactions Algorithm
**Scope:** Per-group only. Not cross-group.
**Input:** `net[user] = sum(paid_share) - sum(amount_owed)` for all non-deleted expenses in the group, minus settlements.
**Algorithm:**
```
1. Split members into creditors (net > 0) and debtors (net < 0)
2. Use two max-heaps (by absolute value)
3. Largest debtor pays largest creditor
4. If debtor amount > creditor amount → creditor settled, debtor carries remainder
5. Repeat until all balances are zero
```
**Complexity:** O(n log n). Acceptable — group sizes are small.
**Critical boundary:** Output is display-only suggestion. Never written to DB. Only confirmed settlements create rows.

### Settle Up Screen
- `simplify_debts = false` (default): shows raw pairwise balances
- `simplify_debts = true`: shows greedy-simplified suggestions
- Toggle stored on `groups` table, changeable by admin

---

## 8. Real-Time: Supabase Realtime

Frontend subscribes directly to Supabase (not through FastAPI):
```typescript
supabase
  .channel(`comments:${expenseId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'expense_comments',
    filter: `expense_id=eq.${expenseId}`
  }, (payload) => {
    setComments(prev => [...prev, payload.new])
  })
  .subscribe()
```

### Missed Events Recovery
Risk: tab backgrounded, browser throttles websocket, user returns to stale comments.
Mitigation: refetch on tab visibility change:
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refetchComments()  // TanStack Query refetch
  }
})
```

---

## 9. Frontend Architecture

### Framework: Next.js 14, App Router

Route structure:
```
/app
  /(auth)/login/page.tsx
  /(auth)/register/page.tsx
  /(auth)/layout.tsx              # no sidebar
  /(app)/dashboard/page.tsx
  /(app)/groups/[id]/page.tsx
  /(app)/groups/[id]/expenses/[expenseId]/page.tsx
  /(app)/layout.tsx               # persistent sidebar
```
- SSR for initial shell only. All dynamic data fetches client-side.

### Styling: Tailwind CSS + shadcn/ui
- shadcn/ui components used: Dialog, Tabs, Toast, DropdownMenu, Skeleton, Badge
- Tailwind for all layout and custom styling

### State Management
| State type | Tool |
|---|---|
| Server state (expenses, balances, members) | TanStack Query |
| UI state (modal open, active tab) | local useState |
| Current user / session | React Context + Supabase auth listener |

### Supabase Client Usage
| Operation | Route | Reason |
|---|---|---|
| Auth (login, register, session) | Supabase client direct | Standard pattern |
| All data operations | FastAPI backend via JWT | Predictable, debuggable, single source of truth |
| Realtime comments | Supabase client direct | Read-only, scoped by expense_id |

---

## 10. Backend Architecture

### Framework: FastAPI (Python)

### Project Structure
```
backend/
  app/
    /auth
      router.py
      schemas.py
    /groups
      router.py
      schemas.py
      service.py
    /expenses
      router.py
      schemas.py
      service.py          # includes recalculate_balances()
    /settlements
      router.py
      schemas.py
      service.py
    /comments
      router.py
      schemas.py
    /core
      database.py         # SQLAlchemy Core + asyncpg engine
      dependencies.py     # get_current_user, get_db
      config.py           # Settings via pydantic BaseSettings
    main.py
  requirements.txt
  .env.example
  railway.toml
```

### Auth Middleware: Local JWT Verification
```python
from jose import jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(
        token,
        settings.SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated"
    )
    return payload["sub"]  # returns user_id (uuid)
```

### Database Access: SQLAlchemy Core + asyncpg
```python
result = await db.execute(
    text("SELECT * FROM expenses WHERE group_id = :gid AND is_deleted = false"),
    {"gid": group_id}
)
```
No ORM. SQL is explicit and readable. Migrations via plain `.sql` files on Supabase.

---

## 11. API Design

Base URL: `/api/v1/`
All endpoints require `Authorization: Bearer <jwt>` except auth.

### Endpoints

#### Groups
```
GET    /api/v1/groups
POST   /api/v1/groups
GET    /api/v1/groups/{id}
PATCH  /api/v1/groups/{id}
POST   /api/v1/groups/{id}/members          # add by email
DELETE /api/v1/groups/{id}/members/{userId} # guarded by balance check
```

#### Expenses
```
GET    /api/v1/groups/{id}/expenses?limit=50&offset=0
POST   /api/v1/groups/{id}/expenses
GET    /api/v1/groups/{id}/expenses/{expenseId}
PATCH  /api/v1/groups/{id}/expenses/{expenseId}
DELETE /api/v1/groups/{id}/expenses/{expenseId}
```

#### Expense Create/Edit Payload
```json
{
  "group_id": "uuid",
  "description": "Dinner",
  "amount": 900.00,
  "paid_by": "uuid",
  "split_type": "equal",
  "date": "2026-06-07",
  "splits": [
    { "user_id": "uuid", "paid_share": 900.00, "amount_owed": 300.00 },
    { "user_id": "uuid", "paid_share": 0.00,   "amount_owed": 300.00 },
    { "user_id": "uuid", "paid_share": 0.00,   "amount_owed": 300.00 }
  ]
}
```

#### Balances
```
GET /api/v1/groups/{id}/balances
```
Response:
```json
{
  "raw": [{ "from": "uuid", "to": "uuid", "amount": 300.00 }],
  "simplified": [{ "from": "uuid", "to": "uuid", "amount": 300.00 }],
  "simplify_enabled": true
}
```
One round trip. Greedy algorithm runs server-side only when `simplify_debts = true`.

#### Settlements
```
POST /api/v1/groups/{id}/settlements
GET  /api/v1/groups/{id}/settlements
```

#### Comments
```
GET  /api/v1/expenses/{expenseId}/comments
POST /api/v1/expenses/{expenseId}/comments
```

### Member Removal Guard
```python
async def remove_member(group_id, user_id, db):
    balance = await get_net_balance(group_id, user_id, db)
    if abs(balance) > 0.01:
        raise HTTPException(
            status_code=400,
            detail="User has unsettled balance. Settle up before removing."
        )
```
Frontend displays `detail` string in a toast.

---

## 12. Deployment

### Frontend: Vercel
- Connect GitHub repo → automatic Next.js deploy, HTTPS, CDN.

### Backend: Railway (Nixpacks)
```toml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
```
Fallback: Render (identical process).

### Environment Variables

**Vercel:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL
```

**Railway:**
```
SUPABASE_JWT_SECRET
SUPABASE_URL
DATABASE_URL
ALLOWED_ORIGINS
```

**Local:** `.env.local` / `.env` in `.gitignore`. `.env.example` committed with placeholders.

### CORS
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**Deployment order:** Deploy frontend first → get Vercel URL → set `ALLOWED_ORIGINS` in Railway → redeploy backend.

---

## 13. Known Risks & Mitigations

| Risk | Failure Mode | Mitigation |
|---|---|---|
| `recalculate_balances` concurrency | Two simultaneous writes produce incorrect balance | Postgres advisory lock per group_id |
| Penny rounding drift | ₹0.01 discrepancy accumulates across splits | Explicit truncate-then-remainder rule, last user absorbs, sorted by user_id for determinism |
| Supabase Realtime missed events | Tab backgrounded, websocket throttled, stale comments on return | `visibilitychange` event triggers TanStack Query refetch |
| CORS misconfiguration | Backend rejects frontend requests post-deploy | Set `ALLOWED_ORIGINS` after first Vercel deploy, documented in deployment order |
| Balance drift on edit | Edit expense without recalculating leaves stale balances | `PATCH /expenses/{id}` always calls `recalculate_balances` after update |

---

## 14. UI Screens Summary

| Screen | Route | Key Components |
|---|---|---|
| Login | `/(auth)/login` | Email/password form, redirect to dashboard |
| Register | `/(auth)/register` | Email/password/name form |
| Dashboard | `/(app)/dashboard` | Group list, net balance summary per group |
| Group Detail | `/(app)/groups/[id]` | Expense list, member list, Settle Up button |
| Expense Detail | `/(app)/groups/[id]/expenses/[expenseId]` | Split breakdown, real-time comments |
| Expense Modal | (overlay) | Tabbed split type selector, member amounts |
| Settle Up Modal | (overlay) | Raw/simplified toggle, confirm payment |

---

## 15. 3-Day Build Plan

### Day 1 — Foundation
- [ ] Supabase project setup: run all SQL migrations, configure Auth, create trigger
- [ ] FastAPI scaffold: project structure, config, database connection, JWT middleware
- [ ] Auth flow: register, login, session persistence in Next.js
- [ ] Groups CRUD: create, list, detail
- [ ] Group members: add by email, list members

### Day 2 — Core Features
- [ ] Expense creation: modal with all 4 split tabs, penny rounding, API integration
- [ ] Expense list + detail view
- [ ] Expense edit and soft delete
- [ ] `recalculate_balances` function with advisory lock
- [ ] Balance display on group detail page

### Day 3 — Standout Features + Deploy
- [ ] Settle Up screen: raw balances view
- [ ] Greedy min-transactions algorithm + simplified view toggle
- [ ] Settlement recording
- [ ] Real-time comments with Supabase Realtime + visibility refetch
- [ ] Member removal with balance guard
- [ ] Deploy: Vercel (frontend) + Railway (backend)
- [ ] Set CORS env vars, smoke test deployed URL

---

## 16. Change Log

| Entry | Change | Reason |
|---|---|---|
| 1 | Initial creation | Project kickoff |
| 2 | Split types, tab UI, paid_share/amount_owed schema | Interview Q3 |
| 3 | Greedy algorithm spec, display-only boundary, simplify_debts toggle | Interview Q4 |
| 4 | balances table, canonical ordering constraint, recalculate_balances design | Interview Q5 |
| 5 | Full schema: groups, expenses, group_members, settlements | Interview Q6 |
| 6 | profiles table, Supabase trigger, expense_comments, Realtime pattern | Interview Q7 |
| 7 | Frontend architecture: Next.js 14, Tailwind+shadcn, TanStack Query, hybrid Supabase | Interview Q8 |
| 8 | Backend architecture: FastAPI, feature-based structure, local JWT, SQLAlchemy Core | Interview Q9 |
| 9 | API design: all endpoints, payloads, balance response shape, member guard | Interview Q10 |
| 10 | Deployment: Vercel, Railway, env vars, CORS order-of-operations | Interview Q11 |
| 11 | Out-of-scope confirmed, expense edit IN scope, risks + mitigations, penny rounding rule, concurrency lock, Realtime recovery | Interview Q12 |

---

## 15. Generated Files Inventory

All files are production-ready and wired together. Nothing is a stub.

### Database
- `database/001_initial_schema.sql` — All 7 tables, indexes, RLS policies, trigger for profiles

### Backend
- `requirements.txt`, `railway.toml`, `.env.example`
- `app/main.py` — FastAPI app, CORS, all routers at `/api/v1`
- `app/core/config.py` — Pydantic Settings
- `app/core/database.py` — SQLAlchemy async engine + get_db
- `app/core/dependencies.py` — get_current_user (local JWT), get_group_member, get_group_admin
- `app/groups/` — schemas, service (CRUD + member guard), router
- `app/expenses/` — schemas (with validators), service (recalculate_balances + greedy algo + CRUD), router
- `app/settlements/router.py` — create + list, triggers recalculate
- `app/comments/router.py` — list + create

### Frontend
- `package.json`, `next.config.js`, `tailwind.config.js`, `tsconfig.json`, `postcss.config.js`
- `app/globals.css` — utility classes (card, btn-primary, input, badge)
- `app/layout.tsx` — root: Geist font, QueryProvider, AuthProvider, Toaster
- `app/page.tsx` — redirect / → /dashboard
- `app/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`
- `app/(app)/layout.tsx` — sidebar + auth guard
- `app/(app)/dashboard/page.tsx` — group grid, empty state
- `app/(app)/groups/[id]/page.tsx` — expense list, balance strip, tabs, modals
- `app/(app)/groups/[id]/expenses/[expenseId]/page.tsx` — split breakdown + realtime comments
- `context/AuthContext.tsx`, `context/QueryProvider.tsx`
- `lib/supabase.ts`, `lib/api.ts` (all API calls + TS types), `lib/splits.ts` (all 4 algos + rounding)
- `components/groups/CreateGroupModal.tsx`, `MembersPanel.tsx`
- `components/expenses/CreateExpenseModal.tsx` — full tabbed modal
- `components/settlements/SettleUpModal.tsx` — raw/simplified toggle + confirm flow

