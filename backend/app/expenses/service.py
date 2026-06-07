import heapq
from math import floor
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from fastapi import HTTPException


# ─────────────────────────────────────────────────────────────
# BALANCE RECALCULATION
# ─────────────────────────────────────────────────────────────

async def recalculate_balances(group_id: str, db: AsyncConnection) -> None:
    """
    Recomputes all balances for a group from scratch.
    Uses a Postgres advisory lock to prevent concurrent recalculation race conditions.
    Called after every expense create/edit/delete and every settlement.
    Entire operation is atomic — runs inside the caller's transaction.
    """
    # Advisory lock scoped to this group (hash to int4 range)
    lock_key = abs(hash(group_id)) % (2**31)
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:key)"),
        {"key": lock_key},
    )

    # Step 1: Wipe existing balances for this group
    await db.execute(
        text("DELETE FROM balances WHERE group_id = :gid"),
        {"gid": group_id},
    )

    # Step 2: Compute net per user pair from expense_splits
    # net[user_a][user_b] = how much user_a owes user_b
    splits_result = await db.execute(
        text("""
            SELECT es.user_id, es.paid_share, es.amount_owed, e.paid_by
            FROM expense_splits es
            JOIN expenses e ON e.id = es.expense_id
            WHERE e.group_id = :gid
              AND e.is_deleted = false
        """),
        {"gid": group_id},
    )
    splits = splits_result.mappings().all()

    # Build net balance map: net[uid] = total paid - total owed
    net: dict[str, float] = {}
    for row in splits:
        uid = row["user_id"]
        net[uid] = net.get(uid, 0.0) + float(row["paid_share"]) - float(row["amount_owed"])

    # Step 3: Subtract settlements (paid_by gets credit, paid_to gets debited)
    settlements_result = await db.execute(
        text("""
            SELECT paid_by, paid_to, amount
            FROM settlements
            WHERE group_id = :gid
        """),
        {"gid": group_id},
    )
    for row in settlements_result.mappings().all():
        pb, pt, amt = row["paid_by"], row["paid_to"], float(row["amount"])
        net[pb] = net.get(pb, 0.0) + amt   # payer's net improves
        net[pt] = net.get(pt, 0.0) - amt   # receiver's net decreases

    # Step 4: Resolve net map into pairwise debts using greedy algorithm,
    # then upsert into balances with canonical ordering (lower UUID < higher UUID)
    debts = _compute_pairwise_from_net(net)

    for (debtor, creditor, amount) in debts:
        if amount < 0.01:
            continue
        # Enforce canonical ordering
        if debtor > creditor:
            debtor, creditor = creditor, debtor
            amount = -amount

        if amount < 0:
            continue

        await db.execute(
            text("""
                INSERT INTO balances (group_id, user_id, counterparty_id, amount, updated_at)
                VALUES (:gid, :uid, :cid, :amount, now())
                ON CONFLICT (group_id, user_id, counterparty_id)
                DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
            """),
            {"gid": group_id, "uid": debtor, "cid": creditor, "amount": round(amount, 2)},
        )


def _compute_pairwise_from_net(net: dict[str, float]) -> list[tuple[str, str, float]]:
    """
    Converts net balances into raw pairwise debts.
    Positive net = creditor, negative net = debtor.
    Returns list of (debtor_id, creditor_id, amount).
    """
    creditors = []  # max-heap of (-amount, uid) — negate for max-heap behavior
    debtors = []    # max-heap of (-abs_amount, uid)

    for uid, balance in net.items():
        balance = round(balance, 2)
        if balance > 0.01:
            heapq.heappush(creditors, (-balance, uid))
        elif balance < -0.01:
            heapq.heappush(debtors, (balance, uid))  # already negative

    result = []
    while creditors and debtors:
        cred_amt, creditor = heapq.heappop(creditors)
        debt_amt, debtor = heapq.heappop(debtors)
        cred_amt = -cred_amt   # restore to positive
        debt_amt = -debt_amt   # restore to positive

        settled = min(cred_amt, debt_amt)
        result.append((debtor, creditor, round(settled, 2)))

        remainder_cred = round(cred_amt - settled, 2)
        remainder_debt = round(debt_amt - settled, 2)

        if remainder_cred > 0.01:
            heapq.heappush(creditors, (-remainder_cred, creditor))
        if remainder_debt > 0.01:
            heapq.heappush(debtors, (-remainder_debt, debtor))

    return result


# ─────────────────────────────────────────────────────────────
# GREEDY MIN-TRANSACTIONS ALGORITHM
# ─────────────────────────────────────────────────────────────

def compute_greedy_settlements(
    net_balances: dict[str, float]
) -> list[dict]:
    """
    Greedy min-transactions algorithm.
    Input: {user_id: net_balance} where positive = creditor, negative = debtor.
    Output: list of {from, to, amount} — minimum transactions to settle all debts.
    Display-only — never written to DB.
    """
    creditors = []
    debtors = []

    for uid, balance in net_balances.items():
        balance = round(balance, 2)
        if balance > 0.01:
            heapq.heappush(creditors, (-balance, uid))
        elif balance < -0.01:
            heapq.heappush(debtors, (balance, uid))

    transactions = []
    while creditors and debtors:
        cred_amt, creditor = heapq.heappop(creditors)
        debt_amt, debtor = heapq.heappop(debtors)
        cred_amt = -cred_amt
        debt_amt = -debt_amt

        settled = min(cred_amt, debt_amt)
        transactions.append({
            "from": debtor,
            "to": creditor,
            "amount": round(settled, 2),
        })

        if round(cred_amt - settled, 2) > 0.01:
            heapq.heappush(creditors, (-(cred_amt - settled), creditor))
        if round(debt_amt - settled, 2) > 0.01:
            heapq.heappush(debtors, (-(debt_amt - settled), debtor))

    return transactions


# ─────────────────────────────────────────────────────────────
# BALANCE READ
# ─────────────────────────────────────────────────────────────

async def get_group_balances(group_id: str, db: AsyncConnection) -> dict:
    """
    Returns raw pairwise balances and (if simplify_debts=true) greedy-simplified list.
    """
    group_result = await db.execute(
        text("SELECT simplify_debts FROM groups WHERE id = :gid"),
        {"gid": group_id},
    )
    group = group_result.mappings().first()
    simplify = group["simplify_debts"] if group else False

    # Raw balances from balances table
    raw_result = await db.execute(
        text("""
            SELECT b.user_id as "from", b.counterparty_id as "to", b.amount,
                   p1.full_name as from_name, p2.full_name as to_name
            FROM balances b
            JOIN profiles p1 ON p1.id = b.user_id
            JOIN profiles p2 ON p2.id = b.counterparty_id
            WHERE b.group_id = :gid
              AND b.amount > 0.01
        """),
        {"gid": group_id},
    )
    raw = [dict(r) for r in raw_result.mappings().all()]

    simplified = raw  # default: same as raw

    if simplify:
        # Build net balances per user for the greedy algorithm
        net_result = await db.execute(
            text("""
                SELECT es.user_id, 
                       SUM(es.paid_share - es.amount_owed) as net
                FROM expense_splits es
                JOIN expenses e ON e.id = es.expense_id
                WHERE e.group_id = :gid AND e.is_deleted = false
                GROUP BY es.user_id
            """),
            {"gid": group_id},
        )
        net_map = {r["user_id"]: float(r["net"]) for r in net_result.mappings().all()}

        # Apply settlements to net map
        settle_result = await db.execute(
            text("SELECT paid_by, paid_to, amount FROM settlements WHERE group_id = :gid"),
            {"gid": group_id},
        )
        for row in settle_result.mappings().all():
            pb, pt, amt = row["paid_by"], row["paid_to"], float(row["amount"])
            net_map[pb] = net_map.get(pb, 0.0) + amt
            net_map[pt] = net_map.get(pt, 0.0) - amt

        raw_simplified = compute_greedy_settlements(net_map)

        # Enrich with names
        all_uids = set(t["from"] for t in raw_simplified) | set(t["to"] for t in raw_simplified)
        if all_uids:
            names_result = await db.execute(
                text("SELECT id, full_name FROM profiles WHERE id = ANY(:ids)"),
                {"ids": list(all_uids)},
            )
            names = {r["id"]: r["full_name"] for r in names_result.mappings().all()}
            for t in raw_simplified:
                t["from_name"] = names.get(t["from"], "Unknown")
                t["to_name"] = names.get(t["to"], "Unknown")
        simplified = raw_simplified

    return {"raw": raw, "simplified": simplified, "simplify_enabled": simplify}


# ─────────────────────────────────────────────────────────────
# EXPENSE CRUD
# ─────────────────────────────────────────────────────────────

async def create_expense(
    group_id: str,
    created_by: str,
    data: dict,
    splits: list[dict],
    db: AsyncConnection,
) -> dict:
    # Validate all split user_ids are group members
    member_result = await db.execute(
        text("SELECT user_id FROM group_members WHERE group_id = :gid"),
        {"gid": group_id},
    )
    member_ids = {str(r["user_id"]) for r in member_result.mappings().all()}
    for s in splits:
        if s["user_id"] not in member_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User {s['user_id']} is not a member of this group",
            )

    expense_result = await db.execute(
        text("""
            INSERT INTO expenses (group_id, description, amount, paid_by, split_type, date, created_by)
            VALUES (:group_id, :description, :amount, :paid_by, :split_type, :date, :created_by)
            RETURNING *
        """),
        {**data, "group_id": group_id, "created_by": created_by},
    )
    expense = dict(expense_result.mappings().first())

    for s in splits:
        await db.execute(
            text("""
                INSERT INTO expense_splits (expense_id, user_id, paid_share, amount_owed)
                VALUES (:expense_id, :user_id, :paid_share, :amount_owed)
            """),
            {**s, "expense_id": expense["id"]},
        )

    await recalculate_balances(group_id, db)
    return expense


async def update_expense(
    expense_id: str,
    group_id: str,
    data: dict,
    splits: list[dict] | None,
    db: AsyncConnection,
) -> dict:
    if data:
        set_clause = ", ".join(f"{k} = :{k}" for k in data)
        data["expense_id"] = expense_id
        result = await db.execute(
            text(f"UPDATE expenses SET {set_clause} WHERE id = :expense_id RETURNING *"),
            data,
        )
        expense = dict(result.mappings().first())
    else:
        result = await db.execute(
            text("SELECT * FROM expenses WHERE id = :id"), {"id": expense_id}
        )
        expense = dict(result.mappings().first())

    if splits is not None:
        await db.execute(
            text("DELETE FROM expense_splits WHERE expense_id = :eid"),
            {"eid": expense_id},
        )
        for s in splits:
            await db.execute(
                text("""
                    INSERT INTO expense_splits (expense_id, user_id, paid_share, amount_owed)
                    VALUES (:expense_id, :user_id, :paid_share, :amount_owed)
                """),
                {**s, "expense_id": expense_id},
            )

    await recalculate_balances(group_id, db)
    return expense


async def soft_delete_expense(
    expense_id: str, group_id: str, db: AsyncConnection
) -> None:
    await db.execute(
        text("UPDATE expenses SET is_deleted = true WHERE id = :id"),
        {"id": expense_id},
    )
    await recalculate_balances(group_id, db)


async def get_expenses(
    group_id: str, limit: int, offset: int, db: AsyncConnection
) -> list:
    result = await db.execute(
        text("""
            SELECT e.*, p.full_name as paid_by_name
            FROM expenses e
            JOIN profiles p ON p.id = e.paid_by
            WHERE e.group_id = :gid AND e.is_deleted = false
            ORDER BY e.date DESC, e.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"gid": group_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in result.mappings().all()]


async def get_expense_detail(expense_id: str, db: AsyncConnection) -> dict:
    result = await db.execute(
        text("""
            SELECT e.*, p.full_name as paid_by_name
            FROM expenses e
            JOIN profiles p ON p.id = e.paid_by
            WHERE e.id = :id AND e.is_deleted = false
        """),
        {"id": expense_id},
    )
    expense = result.mappings().first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    splits_result = await db.execute(
        text("""
            SELECT es.user_id, es.paid_share, es.amount_owed, p.full_name
            FROM expense_splits es
            JOIN profiles p ON p.id = es.user_id
            WHERE es.expense_id = :eid
        """),
        {"eid": expense_id},
    )
    splits = [dict(r) for r in splits_result.mappings().all()]
    return {**dict(expense), "splits": splits}
