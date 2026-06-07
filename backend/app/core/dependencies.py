from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from jose import jwt, JWTError
from app.core.config import settings
from app.core.database import get_db

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Verifies Supabase JWT locally using SUPABASE_JWT_SECRET.
    Returns the user_id (sub claim) as a string.
    No extra HTTP call — fast and network-independent.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
        return user_id
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
        )


async def get_group_member(
    group_id: str,
    current_user: str = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
) -> dict:
    """
    Verifies the current user is a member of the given group.
    Returns the group_member row (includes role).
    Raises 403 if not a member.
    """
    result = await db.execute(
        text("""
            SELECT gm.user_id, gm.role, g.id as group_id, g.name, g.simplify_debts
            FROM group_members gm
            JOIN groups g ON g.id = gm.group_id
            WHERE gm.group_id = :group_id
              AND gm.user_id = :user_id
        """),
        {"group_id": group_id, "user_id": current_user},
    )
    member = result.mappings().first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group",
        )
    return dict(member)


async def get_group_admin(
    group_id: str,
    member: dict = Depends(get_group_member),
) -> dict:
    """Verifies the current user is an admin of the group."""
    if member["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return member
