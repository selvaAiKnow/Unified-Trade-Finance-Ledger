from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_path: str = "model/risk_model.joblib"

    class Config:
        env_file = ".env"


settings = Settings()
