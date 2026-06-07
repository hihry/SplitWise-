from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncConnection
from app.core.dependencies import get_current_user, get_group_member, get_db
from app.expenses.schemas import ExpenseCreate, ExpenseUpdate
from app.expenses import service

router = APIRouter(tags=["expenses"])


@router.get("/groups/{group_id}/expenses")
async def list_expenses(
    group_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    return await service.get_expenses(group_id, limit, offset, db)


@router.post("/groups/{group_id}/expenses", status_code=201)
async def create_expense(
    group_id: str,
    body: ExpenseCreate,
    current_user: str = Depends(get_current_user),
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    data = {
        "description": body.description,
        "amount": body.amount,
        "paid_by": body.paid_by,
        "split_type": body.split_type,
        "date": body.date,
    }
    splits = [s.model_dump() for s in body.splits]
    return await service.create_expense(group_id, current_user, data, splits, db)


@router.get("/groups/{group_id}/expenses/{expense_id}")
async def get_expense(
    group_id: str,
    expense_id: str,
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    return await service.get_expense_detail(expense_id, db)


@router.patch("/groups/{group_id}/expenses/{expense_id}")
async def update_expense(
    group_id: str,
    expense_id: str,
    body: ExpenseUpdate,
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    data = body.model_dump(exclude_none=True, exclude={"splits"})
    splits = [s.model_dump() for s in body.splits] if body.splits else None
    return await service.update_expense(expense_id, group_id, data, splits, db)


@router.delete("/groups/{group_id}/expenses/{expense_id}", status_code=204)
async def delete_expense(
    group_id: str,
    expense_id: str,
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    await service.soft_delete_expense(expense_id, group_id, db)


@router.get("/groups/{group_id}/balances")
async def get_balances(
    group_id: str,
    _: dict = Depends(get_group_member),
    db: AsyncConnection = Depends(get_db),
):
    return await service.get_group_balances(group_id, db)
