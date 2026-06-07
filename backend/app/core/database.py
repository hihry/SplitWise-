from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=True)

async def get_db():
    async with engine.begin() as conn:
        yield conn
