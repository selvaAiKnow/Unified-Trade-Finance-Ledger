from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    blockchain_layer_url: str = "http://localhost:8081"
    blockchain_layer_timeout_seconds: float = 60.0

    class Config:
        env_file = ".env"


settings = Settings()
