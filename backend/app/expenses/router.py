from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user, get_db

router = APIRouter()

@router.get("/{group_id}/expenses")
async def get_expenses(group_id: str, limit: int = 50, offset: int = 0, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.post("/{group_id}/expenses")
async def create_expense(group_id: str, payload: dict, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.patch("/{group_id}/expenses/{expense_id}")
async def edit_expense(group_id: str, expense_id: str, payload: dict, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.delete("/{group_id}/expenses/{expense_id}")
async def delete_expense(group_id: str, expense_id: str, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass
