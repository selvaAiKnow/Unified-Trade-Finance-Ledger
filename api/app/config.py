from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://trade:trade@localhost:5433/trade_finance"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_minutes: int = 1440
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "trade-documents"

    class Config:
        env_file = ".env"


settings = Settings()
