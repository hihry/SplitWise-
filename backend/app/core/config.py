import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_JWT_SECRET: str
    SUPABASE_URL: str
    DATABASE_URL: str
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()
