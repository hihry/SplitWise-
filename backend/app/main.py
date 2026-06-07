from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

from app.auth.router import router as auth_router
from app.groups.router import router as groups_router
from app.expenses.router import router as expenses_router
from app.settlements.router import router as settlements_router
from app.comments.router import router as comments_router

app = FastAPI(title="Splitwise Clone API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(groups_router, prefix="/api/v1/groups", tags=["Groups"])
app.include_router(expenses_router, prefix="/api/v1/groups", tags=["Expenses"])
app.include_router(settlements_router, prefix="/api/v1/groups", tags=["Settlements"])
app.include_router(comments_router, prefix="/api/v1/expenses", tags=["Comments"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
