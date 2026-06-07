from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user, get_db

router = APIRouter()

@router.get("/")
async def get_groups(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.post("/")
async def create_group(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.get("/{group_id}")
async def get_group(group_id: str, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.post("/{group_id}/members")
async def add_member(group_id: str, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.delete("/{group_id}/members/{target_user_id}")
async def remove_member(group_id: str, target_user_id: str, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass

@router.get("/{group_id}/balances")
async def get_balances(group_id: str, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    pass
