from sqlalchemy.ext.asyncio import create_async_engine, AsyncConnection
from sqlalchemy import text
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,  # Set True to log SQL during debugging
)


async def get_db() -> AsyncConnection:
    """Dependency: yields an async DB connection per request."""
    async with engine.begin() as conn:
        yield conn
