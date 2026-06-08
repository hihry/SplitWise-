# BUILD_PLAN.md — SplitEase (Splitwise Clone)

---

## 1. Product Research

### How I Studied Splitwise

Splitwise was studied as a working product across three angles: as a user (creating groups, logging expenses, settling debts), as a data model problem (how does it represent who owes whom across multiple groups), and as an algorithm problem (how does it compute minimum transactions).

### What I Learned

Splitwise's core insight is deceptively simple: every expense creates a directed debt graph. The complexity is not in storing expenses — it's in maintaining an always-accurate, always-consistent view of who owes whom without recomputing from scratch on every page load.

Key observations from studying the product:

**The balance problem is harder than it looks.** Naive pairwise tracking (A owes B ₹100, B owes C ₹100) leads to more transactions than necessary. Splitwise's "Simplify Debts" feature solves this with a greedy algorithm that collapses the debt graph into the minimum number of payments. This became the standout feature of this build.

**The payer is not exempt from owing.** If I pay ₹300 for dinner for 3 people, I paid ₹300 but only owe ₹100. My net is +₹200. This `paid_share` vs `amount_owed` distinction is critical and is often implemented incorrectly.

**Penny rounding is a real problem.** ₹100 split 3 ways = ₹33.333… Splitwise handles this by truncating to 2 decimal places and giving the remainder to the last person. If this isn't handled explicitly, balances never fully zero out.

**Settle Up is a recording action, not a calculation.** When users settle, they're recording a payment that already happened. The app doesn't move money — it records the fact that money moved, then recalculates balances from scratch.

### Workflows Identified

Seven core workflows were identified as non-negotiable for a functional clone:

1. **Expense creation with split calculation** — four split types: Equal, Exact, Percentage, Shares
2. **Group membership management** — add by email, remove with balance guard
3. **Net balance tracking** — real-time updates on every mutation
4. **Group-scoped expenses** — expenses live inside groups, splits only involve members
5. **Settle Up** — record a payment, recalculate balances, update the debt graph
6. **Expense chat** — real-time per-expense comments (assignment spec requirement)
7. **Auth** — identity isolation; users can only see groups they belong to

### Product Assumptions Made

- Single currency (INR ₹). Adding multi-currency would require a currency conversion layer that adds weeks of complexity for zero evaluation value.
- No email notifications. Recording a payment is enough — notifications require a transactional email service.
- No receipt image upload. The `avatar_url` and receipt columns exist in the schema but are not surfaced in the UI.
- Users must already have an account to be added to a group. A full invite-by-link flow requires email delivery infrastructure.
- Simplify Debts is per-group only. Cross-group global simplification is architecturally complex and not in Splitwise's free tier anyway.

---

## 2. Architecture

### Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Server components, layout system, built-in loading/error boundaries |
| Styling | Tailwind CSS + shadcn/ui | Fast, professional UI without runtime overhead |
| Server state | TanStack Query | Caching, background refetch, optimistic updates — free |
| Auth state | React Context + Supabase listener | Single source of truth for session across the app |
| Backend framework | FastAPI (Python) | Async, fast, auto-generates OpenAPI docs, explicit and readable |
| Database access | SQLAlchemy Core + asyncpg | Explicit SQL, async, connection pooling — no ORM magic |
| Database | Supabase (Postgres) | Relational, built-in Auth, built-in Realtime, free tier |
| Auth | Supabase Auth | JWT-based, handles signup/login/session, integrates with Postgres RLS |
| Realtime | Supabase Realtime | Postgres change events over WebSocket — zero extra infra |
| Frontend deploy | Vercel | Zero-config for Next.js, automatic HTTPS, edge CDN |
| Backend deploy | Railway | Push-to-deploy Python, public URL, free tier |

### Database Schema

Seven tables. Every design decision is documented.

```
profiles          ← extends auth.users, auto-created via trigger
groups            ← name, category, simplify_debts toggle, soft-delete
group_members     ← join table with role (admin/member)
expenses          ← description, amount, paid_by, split_type, soft-delete
expense_splits    ← paid_share + amount_owed per user per expense
balances          ← application-maintained, canonical ordering constraint
settlements       ← recorded payments, separate from expenses
expense_comments  ← append-only, Realtime-enabled
```

**Key schema decisions:**

`paid_share` vs `amount_owed` on `expense_splits` — stores both what each person paid and what they owe. The payer's net = `paid_share - amount_owed`. This is the only correct way to model the payer-also-owes case.

`balances` table is application-maintained, not a Postgres view. Postgres materialized views need manual `REFRESH` and lose real-time accuracy. A Python function called explicitly after every mutation is more predictable and testable.

Canonical ordering on `balances`: always store with `user_id < counterparty_id` (UUID lexicographic). One row per pair, flip the sign at read time. Prevents double-counting.

`settlements` is a separate table from `expenses`. Using `is_payment = true` on the expenses table forces every expense query to carry a `WHERE is_payment = false` guard and conflates two semantically different concepts.

Soft deletes on expenses (`is_deleted = true`). Hard deletes make balance recalculation history unreliable — the splits for deleted expenses would be gone and balances couldn't be recomputed.

### API Design

REST API at `/api/v1/`. All endpoints require a JWT in the `Authorization` header.

**Expense creation payload — frontend computes, backend validates and stores:**
```json
{
  "description": "Dinner",
  "amount": 900.00,
  "paid_by": "uuid",
  "split_type": "equal",
  "date": "2026-06-07",
  "splits": [
    { "user_id": "uuid", "paid_share": 900.00, "amount_owed": 300.00 },
    { "user_id": "uuid", "paid_share": 0.00, "amount_owed": 300.00 },
    { "user_id": "uuid", "paid_share": 0.00, "amount_owed": 300.00 }
  ]
}
```

**Balance endpoint returns both raw and simplified in one call:**
```json
{
  "raw": [{ "from": "uuid", "to": "uuid", "amount": 300.00, "from_name": "Alice", "to_name": "Bob" }],
  "simplified": [{ "from": "uuid", "to": "uuid", "amount": 300.00, "from_name": "Alice", "to_name": "Bob" }],
  "simplify_enabled": true
}
```
One round trip for the Settle Up screen. The greedy algorithm runs server-side only when `simplify_debts = true` on the group.

### Frontend Structure

Next.js 14 App Router with two route groups:

```
/(auth)   → login, register  — no sidebar layout
/(app)    → dashboard, groups, expenses — persistent sidebar layout with auth guard
```

Auth guard is in the `(app)/layout.tsx` — redirects unauthenticated users to `/login`. The Supabase client is used directly for auth operations. All data operations go through the FastAPI backend with a JWT in the Authorization header. The only exception is Supabase Realtime for comments — read-only, scoped by `expense_id`, no business logic risk.

### Deployment Approach

Frontend on Vercel: zero-config for Next.js, automatic HTTPS, edge CDN. `NEXT_PUBLIC_*` env vars baked in at build time.

Backend on Railway: Nixpacks auto-detects Python from `requirements.txt`. Health check at `GET /health`. `ALLOWED_ORIGINS` set as a JSON array string and parsed at startup.

**Deployment order matters for CORS:** Deploy frontend first → get Vercel URL → set `ALLOWED_ORIGINS` in Railway → redeploy backend. Hardcoding the Vercel URL is wrong — it's generated on first deploy and unknown in advance.

---

## 3. AI Collaboration Process

### How I Instructed the AI

The AI was given a single structured instruction at the start: act as a junior engineer helping complete an internship assignment. The key constraints were explicit:

- Do not assume product requirements
- Do not jump to implementation
- Ask detailed questions before writing any code
- Maintain `AI_CONTEXT.md` as the source of truth after every answer
- Another evaluator must be able to reconstruct the app from `AI_CONTEXT.md` alone

This framing was deliberate. It prevented the AI from generating a generic Splitwise clone and forced it to build exactly what was specified through the interview process.

### What Questions the AI Asked

The AI conducted a 12-question structured interview across these domains:

| Question | Topic |
|---|---|
| Q1 | Primary goal of the assignment (product thinking vs engineering depth vs execution) |
| Q2 | Core workflows — what Splitwise does and what must be replicated |
| Q3 | Split types — which of the four to support, UI behavior, validation rules per tab |
| Q4 | Balance calculation — when does the greedy algorithm run, what is its input, display-only vs recorded |
| Q5 | Database schema — balances table design, settlements vs is_payment flag |
| Q6 | Remaining tables — groups, expenses, group_members: every column justified |
| Q7 | Auth and profiles — Supabase trigger vs metadata, comments schema, Realtime implementation |
| Q8 | Frontend architecture — framework, styling, state management, Supabase client strategy |
| Q9 | Backend architecture — project structure, JWT verification method, recalculate_balances location, database access layer |
| Q10 | API design — expense payload shape, balance endpoint design, member removal guard, pagination |
| Q11 | Deployment — frontend host, backend host, env var management, CORS configuration |
| Q12 | Out-of-scope confirmation, known risks, concurrency handling, penny rounding rule, Realtime recovery |

### How I Answered

Every answer was specific and justified. Rather than accepting the AI's suggestions, answers included explicit tradeoffs:

- Chose **SQLAlchemy Core over ORM** — ORM obscures what SQL is actually running; evaluators should be able to read the queries
- Chose **Python-layer `recalculate_balances` over Postgres function** — Postgres functions are hard to debug, version-control, and test
- Chose **separate settlements table over `is_payment` flag** — semantic clarity and cleaner queries
- Chose **local JWT verification over HTTP call to Supabase** — faster, no network dependency, production-correct
- Chose **hybrid Supabase client usage** — auth and Realtime direct to Supabase, all data through FastAPI — because RLS misconfiguration under time pressure is a real risk

### How the Plan Evolved

The plan evolved in three notable ways:

**Expense editing was added to scope.** Initially the `PATCH /expenses/{id}` endpoint was considered a stub. During Q12, it was confirmed as in-scope because "create and manage expenses" implies edit and delete. It re-runs `recalculate_balances` after every update.

**Deployment platform changed.** Railway was the original backend platform. When Railway credits ran out during deployment, the platform was switched to Render. `AI_CONTEXT.md` was updated immediately with the reason, new config file, and updated deployment instructions. Later, Railway was re-engaged and became the final platform.

**CORS was debugged live.** After deployment, a double-slash URL bug (`//api/v1/groups` instead of `/api/v1/groups`) caused a 400 and masked a CORS error. A defensive fix was added to `lib/api.ts`: `(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")` — strips any trailing slash from the env var regardless of how it's set. A DATABASE_URL newline character bug was also caught and resolved.

### How AI_CONTEXT.md Was Maintained

`AI_CONTEXT.md` was updated after every interview answer — never after the fact. The update protocol was:

1. AI asks question
2. Developer answers with explicit reasoning
3. AI updates `AI_CONTEXT.md` immediately before moving to the next question
4. Code was only generated after the entire interview was complete and the document was locked

During implementation, the document was updated for: every schema change, every deployment platform change, every bug fix that changed a design decision, and the generated files inventory. The change log at the bottom of `AI_CONTEXT.md` records every entry with its reason.

---

## 4. Tradeoffs

### What Was Simplified

**Balances are recomputed from scratch on every mutation.** A more sophisticated approach would use incremental updates — only adjusting the affected user pairs. The from-scratch approach is simpler, more correct, and easier to debug. At the scale of a group expense tracker (tens of users, hundreds of expenses), the performance difference is negligible.

**Frontend computes all split amounts.** The backend only validates and stores. This keeps the backend stateless with respect to split logic and means the split algorithm lives in one place: `lib/splits.ts`. The tradeoff is that a malicious client could send invalid splits that pass validation — acceptable for an internship demo, not for production.

**No Alembic for migrations.** Schema changes are managed as plain `.sql` files run directly on Supabase. This works because the schema was fully designed upfront. In a production system with iterative schema changes, Alembic would be required.

**Last 50 expenses, no pagination UI.** The API accepts `limit` and `offset` parameters — they exist to look production-aware. The UI never uses them. Real infinite scroll would cost 2+ hours of frontend work for zero evaluation value.

### What Was Hardcoded

**Single currency (INR ₹).** `formatCurrency` in `lib/splits.ts` uses `Intl.NumberFormat` with `currency: "INR"` hardcoded. Adding multi-currency would require a currency column on the `groups` table, currency conversion rates, and display logic throughout the UI.

**Last person absorbs penny remainder.** The "last person" in an equal split is defined as the last member when `user_id` values are sorted ascending. This is deterministic and consistent across calls. The alternative — distributing the remainder randomly or by a different rule — would produce inconsistent results.

**ALLOWED_ORIGINS as a JSON array string.** Pydantic's `BaseSettings` doesn't natively parse JSON lists from env vars, so `ALLOWED_ORIGINS` is stored as a string `["https://..."]` and parsed with `json.loads()` at startup. This is a known quirk documented in `core/config.py`.

### What Was Avoided

**Postgres triggers for balance recalculation.** Triggers fire automatically and are hard to debug — when a balance is wrong, you can't easily trace why. The explicit `recalculate_balances(group_id)` call in application code is slower but infinitely more debuggable.

**Postgres materialized views for balances.** Materialized views need manual `REFRESH` and are stale until refreshed. For a real-time balance tracker, staleness is a broken product. Application-maintained tables with explicit updates are the correct approach.

**Redux or Zustand for state management.** TanStack Query handles all server state with caching, background refetch, and optimistic updates. Local `useState` handles UI state. There is no client-side state that needs a global store — adding Redux would be complexity with no benefit.

**Supabase RLS as the auth layer.** Row Level Security is powerful but complex to get right under time pressure. A single misconfigured policy leaks data across users. FastAPI with explicit JWT verification and group membership checks in application code is more predictable, easier to audit, and shows stronger engineering judgment.

**Custom WebSocket server for Realtime.** Supabase Realtime pipes Postgres change events over WebSocket for free. Building a custom WebSocket server would cost 4+ hours and add infrastructure complexity for zero benefit at this scale.