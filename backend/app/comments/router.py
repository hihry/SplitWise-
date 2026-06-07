from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user, get_db

router = APIRouter()

@router.get("/{expense_id}/comments")
async def get_comments(expense_id: str, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.post("/{expense_id}/comments")
async def create_comment(expense_id: str, payload: dict, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass
