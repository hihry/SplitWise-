from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    DATABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    ALLOWED_ORIGINS: str = '["http://localhost:3000","http://127.0.0.1:3000"]'

    def get_allowed_origins(self) -> List[str]:
        try:
            return json.loads(self.ALLOWED_ORIGINS)
        except Exception:
            return [self.ALLOWED_ORIGINS]

    class Config:
        env_file = ".env"


settings = Settings()
