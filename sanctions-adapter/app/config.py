from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    sdn_xml_url: str = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"
    refresh_interval_seconds: int = 86400

    class Config:
        env_file = ".env"


settings = Settings()
