from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from pydantic import BaseModel, Field
from typing import Optional
from app.core.dependencies import get_current_user, get_group_member, get_db
from app.expenses.service import recalculate_balances

router = APIRouter(tags=["settlements"])


class SettlementCreate(BaseModel):
    paid_by: str
    paid_to: str
    amount: float = Field(..., gt=0)
    note: Optional[str] = None


@router.post("/groups/{group_id}/settlements", status_code=201)
async def create_settlement(
    group_id: str,
    body: SettlementCreate,
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    result = await db.execute(
        text("""
            INSERT INTO settlements (group_id, paid_by, paid_to, amount, note)
            VALUES (:group_id, :paid_by, :paid_to, :amount, :note)
            RETURNING *
        """),
        {
            "group_id": group_id,
            "paid_by": body.paid_by,
            "paid_to": body.paid_to,
            "amount": body.amount,
            "note": body.note,
        },
    )
    settlement = dict(result.mappings().first())
    await recalculate_balances(group_id, db)
    return settlement


@router.get("/groups/{group_id}/settlements")
async def list_settlements(
    group_id: str,
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT s.*, 
                   p1.full_name as paid_by_name,
                   p2.full_name as paid_to_name
            FROM settlements s
            JOIN profiles p1 ON p1.id = s.paid_by
            JOIN profiles p2 ON p2.id = s.paid_to
            WHERE s.group_id = :gid
            ORDER BY s.created_at DESC
        """),
        {"gid": group_id},
    )
    return [dict(r) for r in result.mappings().all()]
