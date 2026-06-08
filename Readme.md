# SplitEase — Splitwise Clone

> A full-stack expense splitting app built in 3 days. Track shared expenses, split bills four ways, and settle debts with a greedy minimum-transactions algorithm.

**Live App:** https://split-wise-hlx7.vercel.app
**Backend API:** https://splitwise-production-5b4d.up.railway.app/docs

---

## What It Does

- Create groups (trip, home, work) and add members by email
- Add expenses and split them four ways: Equal, Exact, Percentage, or Shares
- Penny-rounding handled explicitly — last member absorbs the remainder
- Net balance tracking — updates instantly on every expense
- Settle Up with a **greedy min-transactions algorithm** that suggests the fewest payments needed to clear all debts (the standout feature — not naive pairwise balances)
- Real-time expense comments via Supabase Realtime websockets
- Member removal blocked if the user has an unsettled balance

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| State | TanStack Query (server state) + React Context (auth) |
| Backend | FastAPI (Python), SQLAlchemy Core, asyncpg |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth — JWT verified locally in FastAPI |
| Realtime | Supabase Realtime (Postgres → WebSocket) |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |

---

## AI Tool Used

This project was built using **Claude (Anthropic)** — specifically Claude Sonnet via claude.ai.

The entire build process was driven by a structured AI collaboration protocol:

1. Claude interviewed the developer across 12 question sets covering product scope, data model, API design, split logic, deployment, and known risks before writing a single line of code
2. All decisions were logged in real-time to `AI_CONTEXT.md` — the canonical source of truth
3. Code was generated only after the context document was complete and agreed upon
4. Every deployment issue (CORS errors, double-slash URL bug, DATABASE_URL newline character) was debugged with Claude by sharing exact error messages

The `AI_CONTEXT.md` file in this repo documents every architectural decision, tradeoff, and change made throughout the build. An evaluator can reconstruct the app from that file alone.

---

## Project Structure

```
splitwise-clone/
├── AI_CONTEXT.md          ← Source of truth for all decisions
├── BUILD_PLAN.md          ← Product research, architecture, tradeoffs
├── database/
│   └── 001_initial_schema.sql
├── frontend/              ← Next.js 14 App Router
│   ├── app/
│   │   ├── (auth)/login
│   │   ├── (auth)/register
│   │   ├── (app)/dashboard
│   │   ├── (app)/groups/[id]
│   │   └── (app)/groups/[id]/expenses/[expenseId]
│   ├── components/
│   │   ├── expenses/CreateExpenseModal.tsx
│   │   ├── groups/CreateGroupModal.tsx
│   │   ├── groups/MembersPanel.tsx
│   │   └── settlements/SettleUpModal.tsx
│   ├── context/           ← AuthContext, QueryProvider
│   └── lib/               ← api.ts, splits.ts, supabase.ts
└── backend/               ← FastAPI
    └── app/
        ├── core/          ← config, database, dependencies (JWT)
        ├── groups/
        ├── expenses/      ← recalculate_balances + greedy algorithm
        ├── settlements/
        └── comments/
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- A Supabase project (free at supabase.com)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/splitwise-clone.git
cd splitwise-clone
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste the contents of `database/001_initial_schema.sql` → **Run**
3. Go to **Database → Replication** → enable the `expense_comments` table for Realtime
4. From **Settings → API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key
   - JWT Secret

### 3. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in .env with your Supabase values:
# DATABASE_URL=postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
# SUPABASE_JWT_SECRET=...
# SUPABASE_URL=https://[ref].supabase.co
# SUPABASE_SERVICE_ROLE_KEY=...
# ALLOWED_ORIGINS=["http://localhost:3000"]

uvicorn app.main:app --reload
# API running at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

> **Important:** `DATABASE_URL` must start with `postgresql+asyncpg://` not `postgres://`. Supabase gives you `postgres://` — change the prefix manually.

### 4. Run the frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Fill in .env.local:
# NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
# App running at http://localhost:3000
```

---

## Deployment

### Frontend → Vercel

1. Push repo to GitHub
2. Import at [vercel.com](https://vercel.com) → set **Root Directory** to `frontend`
3. Add environment variables in Vercel dashboard:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_API_URL   ← your Railway backend URL
   ```
4. Deploy

### Backend → Railway

1. Create new project at [railway.app](https://railway.app)
2. Connect GitHub repo → set root directory to `backend`
3. Add environment variables in Railway dashboard:
   ```
   DATABASE_URL             ← postgresql+asyncpg://... (no trailing newline)
   SUPABASE_JWT_SECRET
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   ALLOWED_ORIGINS          ← ["https://your-app.vercel.app"]
   ```
4. Railway auto-detects Python and runs `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### CORS order of operations
Deploy frontend first → get Vercel URL → set `ALLOWED_ORIGINS` in Railway → redeploy backend.

---

## Known Limitations

| Feature | Status |
|---|---|
| Email notifications | Not implemented |
| Avatar uploads | Column exists, always null |
| Multi-currency | INR only |
| Infinite scroll | Last 50 expenses only |
| Expense reactions | Not implemented |
| Invite by link | Email lookup only — user must already have an account |