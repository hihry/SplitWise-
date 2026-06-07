from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from pydantic import BaseModel, Field
from app.core.dependencies import get_current_user, get_db

router = APIRouter(tags=["comments"])


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1)


@router.get("/expenses/{expense_id}/comments")
async def list_comments(
    expense_id: str,
    current_user: str = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT ec.id, ec.expense_id, ec.user_id, ec.body, ec.created_at,
                   p.full_name, p.avatar_url
            FROM expense_comments ec
            JOIN profiles p ON p.id = ec.user_id
            WHERE ec.expense_id = :eid
            ORDER BY ec.created_at ASC
        """),
        {"eid": expense_id},
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("/expenses/{expense_id}/comments", status_code=201)
async def create_comment(
    expense_id: str,
    body: CommentCreate,
    current_user: str = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    result = await db.execute(
        text("""
            INSERT INTO expense_comments (expense_id, user_id, body)
            VALUES (:expense_id, :user_id, :body)
            RETURNING *
        """),
        {"expense_id": expense_id, "user_id": current_user, "body": body.body},
    )
    return dict(result.mappings().first())
