from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.matching import grade_match
from app.schemas import MatchDetail, ScreenRequest, ScreenResponse
from app.sdn_cache import sdn_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    await sdn_cache.refresh_safely()
    yield


app = FastAPI(title="UTFL Sanctions Adapter", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/screen", response_model=ScreenResponse)
async def screen(payload: ScreenRequest) -> ScreenResponse:
    matches: list[MatchDetail] = []
    best_status = "CLEAR"

    for candidate in sdn_cache.get_candidates():
        kind = grade_match(payload.name, candidate.name)
        if kind == "NONE":
            continue

        for program in candidate.programs or ["UNSPECIFIED"]:
            matches.append(
                MatchDetail(name=candidate.name, sdn_type=candidate.sdn_type, program=program, match_kind=kind)
            )

        if kind == "EXACT":
            best_status = "BLOCK"
        elif kind == "FUZZY" and best_status != "BLOCK":
            best_status = "REVIEW"

    return ScreenResponse(
        status=best_status,
        matches=matches,
        raw={"query": {"name": payload.name, "country": payload.country}, "match_count": len(matches)},
    )
