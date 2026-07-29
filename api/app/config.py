from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from pydantic_settings import BaseSettings
from urllib.parse import quote_plus
from .helpers.helper import get_env_value

# Environment variables
host = get_env_value("HOST")
username = get_env_value("DB_USERNAME")
password = get_env_value("DB_PASSWORD")
database_name = get_env_value("DATABASE_NAME")

encoded_password = quote_plus(password)

DATABASE_URL = (
    f"postgresql+asyncpg://{username}:{encoded_password}@{host}:5432/{database_name}"
)

class Settings(BaseSettings):
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_minutes: int = 1440
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "trade-documents"
    sanctions_adapter_url: str | None = None


settings = Settings()
