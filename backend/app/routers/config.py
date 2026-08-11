"""Runtime configuration served to clients.

This endpoint is what lets thresholds be tuned WITHOUT shipping an app update.
A client never hardcodes a band boundary; it fetches them at launch. Given that
threshold tuning is the most likely change to be made the night before a demo,
this saves a 30-minute mobile build every time.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models.common import ConfigResponse
from app.models.search import REASON_CODES
from app.services.scoring import ADVISORY

router = APIRouter(prefix="/v1", tags=["config"])


@router.get("/config", response_model=ConfigResponse, summary="Client runtime configuration")
async def get_config(settings: Settings = Depends(get_settings)) -> ConfigResponse:
    return ConfigResponse(
        dataset_mode=settings.dataset_mode,
        allowed_model_ids=list(settings.model_ids),
        quality_floor=settings.quality_floor,
        bands=settings.band_config,
        ambiguity_gap=settings.ambiguity_gap,
        top_k_default=settings.search_top_k_default,
        top_k_min=settings.search_top_k_min,
        top_k_max=settings.search_top_k_max,
        pending_decision_limit=settings.search_pending_limit,
        search_expiry_minutes=settings.search_expiry_minutes,
        reason_codes=list(REASON_CODES),
        advisory=ADVISORY,
        server_time=datetime.now(UTC),
    )
