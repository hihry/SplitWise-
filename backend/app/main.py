from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.groups.router import router as groups_router
from app.expenses.router import router as expenses_router
from app.settlements.router import router as settlements_router
from app.comments.router import router as comments_router

app = FastAPI(
    title="Splitwise Clone API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(groups_router, prefix=API_PREFIX)
app.include_router(expenses_router, prefix=API_PREFIX)
app.include_router(settlements_router, prefix=API_PREFIX)
app.include_router(comments_router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok"}
