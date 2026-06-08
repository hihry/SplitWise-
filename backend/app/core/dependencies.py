# 1.2.from fastapi import Depends, HTTPException, status
# from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
# from sqlalchemy.ext.asyncio import AsyncConnection
# from sqlalchemy import text
# from jose import jwt, JWTError
# import httpx
# from app.core.config import settings
# from app.core.database import get_db

# security = HTTPBearer()

# _jwks_cache = None

# async def get_jwks():
#     global _jwks_cache
#     if _jwks_cache is None:
#         async with httpx.AsyncClient() as client:
#             resp = await client.get(
#                 f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
#             )
#             _jwks_cache = resp.json()
#     return _jwks_cache

#1. async def get_current_user(
#     credentials: HTTPAuthorizationCredentials = Depends(security),
# ) -> str:
#     """
#     Verifies Supabase JWT locally using SUPABASE_JWT_SECRET.
#     Returns the user_id (sub claim) as a string.
#     No extra HTTP call — fast and network-independent.
#     """
#     token = credentials.credentials
#     try:
#         payload = jwt.decode(
#             token,
#             settings.SUPABASE_JWT_SECRET,
#             algorithms=["HS256"],
#             audience="authenticated",
#         )
#         user_id: str = payload.get("sub")
#         if not user_id:
#             raise HTTPException(
#                 status_code=status.HTTP_401_UNAUTHORIZED,
#                 detail="Invalid token: missing subject",
#             )
#         return user_id
#     except JWTError as e:
#         # raise HTTPException(
#         #     status_code=status.HTTP_401_UNAUTHORIZED,
#         #     detail=f"Invalid or expired token: {str(e)}",
#         # )

#         unverified_header = jwt.get_unverified_header(token)
#         alg_used = unverified_header.get("alg", "UNKNOWN")

#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail=f"DEBUG - Token used alg: {alg_used} | Original error: {str(e)}",
#         )

# 2. async def get_current_user(
#     credentials: HTTPAuthorizationCredentials = Depends(security),
# ) -> str:
#     """
#     Verifies Supabase JWT using JWKS endpoint (ES256).
#     Returns the user_id (sub claim) as a string.
#     JWKS response is cached in memory after first fetch.
#     """
#     token = credentials.credentials
#     try:
#         jwks = await get_jwks()
#         payload = jwt.decode(
#             token,
#             jwks,
#             algorithms=["ES256"],
#             audience="authenticated",
#         )
#         return payload["sub"]
#     except JWTError as e:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail=f"Invalid token: {str(e)}",
#             headers={"WWW-Authenticate": "Bearer"},
#         )

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from jose import jwt, JWTError
import httpx
from app.core.config import settings
from app.core.database import get_db

security = HTTPBearer()

_jwks_cache = None

async def get_jwks(force_refresh: bool = False):
    """Fetches Supabase JWKS with an option to bypass the cache."""
    global _jwks_cache
    if _jwks_cache is None or force_refresh:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
                )
                resp.raise_for_status()  # Ensure we don't cache a 500/404 error
                _jwks_cache = resp.json()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch authentication keys: {str(e)}"
            )
    return _jwks_cache


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Verifies Supabase JWT. Dynamically handles both legacy HS256 and new ES256 tokens.
    Includes automatic cache invalidation if JWKS keys rotate.
    """
    token = credentials.credentials
    
    try:
        # 1. Peek at the token header to know what algorithm to expect
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")

        if alg == "HS256":
            key = settings.SUPABASE_JWT_SECRET
        elif alg == "ES256":
            key = await get_jwks()
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unsupported token algorithm: {alg}"
            )

        # 2. Attempt to decode
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience="authenticated",
            )
        except JWTError:
            # 3. Cache Invalidation: If ES256 fails, Supabase might have rotated keys. 
            # Force a fresh fetch from the network and try exactly one more time.
            if alg == "ES256":
                fresh_key = await get_jwks(force_refresh=True)
                payload = jwt.decode(
                    token,
                    fresh_key,
                    algorithms=[alg],
                    audience="authenticated",
                )
            else:
                raise # If HS256 fails, it's just a bad token. Re-raise error.

        # 4. Extract user
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
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
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
