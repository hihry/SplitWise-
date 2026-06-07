from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from app.core.dependencies import get_current_user, get_group_member, get_group_admin, get_db
from app.groups.schemas import GroupCreate, GroupUpdate, AddMemberRequest
from app.groups import service

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("")
async def list_groups(
    current_user: str = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    return await service.get_user_groups(current_user, db)


@router.post("", status_code=201)
async def create_group(
    body: GroupCreate,
    current_user: str = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    return await service.create_group(body.name, body.category, current_user, db)


@router.get("/{group_id}")
async def get_group(
    group_id: str,
    member: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    return await service.get_group_with_members(group_id, db)


@router.patch("/{group_id}")
async def update_group(
    group_id: str,
    body: GroupUpdate,
    member: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    # Only admins can change simplify_debts and is_archived
    if (body.simplify_debts is not None or body.is_archived is not None):
        if member["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin required")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["group_id"] = group_id

    result = await db.execute(
        text(f"UPDATE groups SET {set_clause} WHERE id = :group_id RETURNING *"),
        updates,
    )
    return dict(result.mappings().first())


@router.post("/{group_id}/members", status_code=201)
async def add_member(
    group_id: str,
    body: AddMemberRequest,
    member: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    return await service.add_member_by_email(group_id, body.email, db)


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: str,
    user_id: str,
    admin: dict = Depends(get_group_admin),
    db: AsyncConnection = Depends(get_db),
):
    await service.remove_member(group_id, user_id, db)
