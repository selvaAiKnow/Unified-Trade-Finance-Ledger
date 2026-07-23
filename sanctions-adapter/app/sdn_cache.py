import asyncio
import logging

import httpx

from app.config import settings
from app.sdn_parser import CandidateName, parse_sdn_xml

logger = logging.getLogger(__name__)


class SdnCache:
    def __init__(self) -> None:
        self._candidates: list[CandidateName] = []

    def get_candidates(self) -> list[CandidateName]:
        return self._candidates

    async def refresh(self) -> None:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(settings.sdn_xml_url)
            response.raise_for_status()
            candidates = parse_sdn_xml(response.content)
        self._candidates = candidates

    async def refresh_safely(self) -> None:
        try:
            await self.refresh()
        except Exception:
            logger.exception("SDN list refresh failed; keeping previous cache")

    async def run_periodic_refresh(self) -> None:
        while True:
            await asyncio.sleep(settings.refresh_interval_seconds)
            await self.refresh_safely()


sdn_cache = SdnCache()
