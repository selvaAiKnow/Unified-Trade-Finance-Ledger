from app.config import settings
from app.sanctions.client import SanctionsClient
from app.sanctions.fake import FakeSanctionsClient
from app.sanctions.http_client import HttpSanctionsClient


def get_sanctions_client() -> SanctionsClient:
    if settings.sanctions_adapter_url:
        return HttpSanctionsClient(base_url=settings.sanctions_adapter_url)
    return FakeSanctionsClient()
