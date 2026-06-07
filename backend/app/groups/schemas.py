from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class GroupCategory(str, Enum):
    trip = "trip"
    home = "home"
    work = "work"
    other = "other"


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: GroupCategory = GroupCategory.other


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[GroupCategory] = None
    simplify_debts: Optional[bool] = None
    is_archived: Optional[bool] = None


class MemberResponse(BaseModel):
    user_id: str
    full_name: str
    avatar_url: Optional[str]
    role: str
    joined_at: datetime


class GroupResponse(BaseModel):
    id: str
    name: str
    category: str
    created_by: Optional[str]
    simplify_debts: bool
    is_archived: bool
    created_at: datetime
    members: List[MemberResponse] = []


class AddMemberRequest(BaseModel):
    email: str
