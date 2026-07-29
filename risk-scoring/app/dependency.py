from app.config import settings
from app.model import RiskModel, load_risk_model

_risk_model: RiskModel | None = None
_load_attempted = False


def get_risk_model() -> RiskModel | None:
    global _risk_model, _load_attempted
    if not _load_attempted:
        _load_attempted = True
        try:
            _risk_model = load_risk_model(settings.model_path)
        except FileNotFoundError:
            _risk_model = None
    return _risk_model
