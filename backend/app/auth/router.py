from fastapi import APIRouter

router = APIRouter()

# Note: Authentication handles registration/login directly via Supabase mostly, 
# but any custom routes (like getting current session profile) can go here.

@router.get("/me")
async def get_me():
    return {"message": "Use get_current_user dependency"}
