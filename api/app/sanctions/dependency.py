from app.sanctions.client import SanctionsClient
from app.sanctions.fake import FakeSanctionsClient


def get_sanctions_client() -> SanctionsClient:
    # Swapped for a real HTTP-calling client once the sanctions-adapter
    # sub-project exists; the interface in client.py does not change.
    return FakeSanctionsClient()
