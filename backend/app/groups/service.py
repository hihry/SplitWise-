from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from fastapi import HTTPException, status


async def get_group_with_members(group_id: str, db: AsyncConnection) -> dict:
    """Fetch group details with all members and their profiles."""
    group_result = await db.execute(
        text("SELECT * FROM groups WHERE id = :id"),
        {"id": group_id},
    )
    group = group_result.mappings().first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    members_result = await db.execute(
        text("""
            SELECT gm.user_id, gm.role, gm.joined_at,
                   p.full_name, p.avatar_url
            FROM group_members gm
            JOIN profiles p ON p.id = gm.user_id
            WHERE gm.group_id = :group_id
            ORDER BY gm.joined_at ASC
        """),
        {"group_id": group_id},
    )
    members = [dict(r) for r in members_result.mappings().all()]

    return {**dict(group), "members": members}


async def get_user_groups(user_id: str, db: AsyncConnection) -> list:
    """Fetch all non-archived groups for a user."""
    result = await db.execute(
        text("""
            SELECT g.*, 
                   COUNT(gm2.user_id) as member_count
            FROM groups g
            JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = :user_id
            LEFT JOIN group_members gm2 ON gm2.group_id = g.id
            WHERE g.is_archived = false
            GROUP BY g.id
            ORDER BY g.created_at DESC
        """),
        {"user_id": user_id},
    )
    return [dict(r) for r in result.mappings().all()]


async def create_group(
    name: str, category: str, created_by: str, db: AsyncConnection
) -> dict:
    """Create a group and add creator as admin."""
    result = await db.execute(
        text("""
            INSERT INTO groups (name, category, created_by)
            VALUES (:name, :category, :created_by)
            RETURNING *
        """),
        {"name": name, "category": category, "created_by": created_by},
    )
    group = dict(result.mappings().first())

    # Creator becomes admin
    await db.execute(
        text("""
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (:group_id, :user_id, 'admin')
        """),
        {"group_id": group["id"], "user_id": created_by},
    )
    return group


async def add_member_by_email(
    group_id: str, email: str, db: AsyncConnection
) -> dict:
    """Look up user by email (via auth.users) and add to group."""
    # Look up user by email in auth.users (requires service role)
    user_result = await db.execute(
        text("""
            SELECT p.id, p.full_name
            FROM auth.users u
            JOIN profiles p ON p.id = u.id
            WHERE u.email = :email
        """),
        {"email": email},
    )
    user = user_result.mappings().first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail=f"No user found with email {email}. They must sign up first.",
        )

    # Check not already a member
    existing = await db.execute(
        text("""
            SELECT id FROM group_members
            WHERE group_id = :gid AND user_id = :uid
        """),
        {"gid": group_id, "uid": user["id"]},
    )
    if existing.first():
        raise HTTPException(status_code=409, detail="User is already a member")

    await db.execute(
        text("""
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (:group_id, :user_id, 'member')
        """),
        {"group_id": group_id, "user_id": user["id"]},
    )
    return dict(user)


async def remove_member(
    group_id: str, user_id: str, db: AsyncConnection
) -> None:
    """
    Remove a member from a group.
    Blocked if user has any non-zero balance in the group.
    """
    # Check balance — query the balances table for this user in this group
    balance_result = await db.execute(
        text("""
            SELECT COALESCE(SUM(
                CASE 
                    WHEN user_id = :uid THEN amount        -- user owes
                    WHEN counterparty_id = :uid THEN -amount  -- user is owed
                END
            ), 0) as net_balance
            FROM balances
            WHERE group_id = :gid
              AND (user_id = :uid OR counterparty_id = :uid)
        """),
        {"gid": group_id, "uid": user_id},
    )
    net = balance_result.scalar()

    if net is not None and abs(float(net)) > 0.01:
        raise HTTPException(
            status_code=400,
            detail="User has unsettled balance. Settle up before removing.",
        )

    await db.execute(
        text("""
            DELETE FROM group_members
            WHERE group_id = :gid AND user_id = :uid
        """),
        {"gid": group_id, "uid": user_id},
    )
