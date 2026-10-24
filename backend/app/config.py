from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./pulse.db"
    jwt_secret: str = "dev-only-secret-change-me-in-production-please"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720
    admin_username: str = "admin"
    admin_password: str = "admin123"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
