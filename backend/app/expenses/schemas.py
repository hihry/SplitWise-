from pydantic import BaseModel, Field, model_validator
from typing import List, Optional
from datetime import date, datetime
from enum import Enum


class SplitType(str, Enum):
    equal = "equal"
    exact = "exact"
    percentage = "percentage"
    shares = "shares"


class SplitInput(BaseModel):
    user_id: str
    paid_share: float = Field(ge=0)
    amount_owed: float = Field(ge=0)


class ExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    amount: float = Field(..., gt=0)
    paid_by: str
    split_type: SplitType
    date: date
    splits: List[SplitInput]

    @model_validator(mode="after")
    def validate_splits(self):
        total = self.amount
        tolerance = 0.02  # 2 cents tolerance for rounding

        paid_sum = sum(s.paid_share for s in self.splits)
        owed_sum = sum(s.amount_owed for s in self.splits)

        if abs(paid_sum - total) > tolerance:
            raise ValueError(
                f"Sum of paid_share ({paid_sum:.2f}) must equal amount ({total:.2f})"
            )
        if abs(owed_sum - total) > tolerance:
            raise ValueError(
                f"Sum of amount_owed ({owed_sum:.2f}) must equal amount ({total:.2f})"
            )
        return self


class ExpenseUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    amount: Optional[float] = Field(None, gt=0)
    paid_by: Optional[str] = None
    split_type: Optional[SplitType] = None
    date: Optional[date] = None
    splits: Optional[List[SplitInput]] = None

    @model_validator(mode="after")
    def validate_splits_if_present(self):
        if self.splits and self.amount:
            tolerance = 0.02
            paid_sum = sum(s.paid_share for s in self.splits)
            owed_sum = sum(s.amount_owed for s in self.splits)
            if abs(paid_sum - self.amount) > tolerance:
                raise ValueError("Sum of paid_share must equal amount")
            if abs(owed_sum - self.amount) > tolerance:
                raise ValueError("Sum of amount_owed must equal amount")
        return self


class SplitResponse(BaseModel):
    user_id: str
    full_name: str
    paid_share: float
    amount_owed: float


class ExpenseResponse(BaseModel):
    id: str
    group_id: str
    description: str
    amount: float
    paid_by: str
    paid_by_name: str
    split_type: str
    date: date
    created_by: str
    created_at: datetime
    splits: List[SplitResponse] = []
