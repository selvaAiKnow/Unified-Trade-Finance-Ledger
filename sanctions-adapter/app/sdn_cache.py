import asyncio
import contextlib
import logging

import httpx

from app.config import settings
from app.sdn_parser import CandidateName, parse_sdn_xml

logger = logging.getLogger(__name__)


class SdnCache:
    def __init__(self) -> None:
        self._candidates: list[CandidateName] = []
        self._refresh_task: asyncio.Task | None = None

    def get_candidates(self) -> list[CandidateName]:
        return self._candidates

    async def refresh(self) -> None:
        async with httpx.AsyncClient(
            timeout=30.0, headers={"User-Agent": "UTFL-Sanctions-Adapter/1.0"}
        ) as client:
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

    def start_periodic_refresh(self) -> None:
        if self._refresh_task is None or self._refresh_task.done():
            self._refresh_task = asyncio.create_task(self.run_periodic_refresh())

    async def stop_periodic_refresh(self) -> None:
        if self._refresh_task is not None:
            self._refresh_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._refresh_task
            self._refresh_task = None


sdn_cache = SdnCache()
