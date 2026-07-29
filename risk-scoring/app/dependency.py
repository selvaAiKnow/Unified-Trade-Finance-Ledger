from functools import lru_cache

from app.config import settings
from app.model import RiskModel, load_risk_model


@lru_cache(maxsize=1)
def get_risk_model() -> RiskModel | None:
    try:
        return load_risk_model(settings.risk_model_path)
    except FileNotFoundError:
        return None
