"""Response envelope fields carried by every 2xx."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings


class Envelope(BaseModel):
    """Present on every successful response.

    `dataset_mode` is on EVERY response by design: a client cannot accidentally
    render prototype data as though it were operational.
    """

    model_config = ConfigDict(populate_by_name=True)

    dataset_mode: str = Field(examples=["synthetic"])
    model_id: str = Field(examples=["insightface/w600k_r50@1"])
    server_time: datetime

    @classmethod
    def build(cls, settings: Settings) -> dict[str, object]:
        return {
            "dataset_mode": settings.dataset_mode,
            "model_id": settings.model_ids[0] if settings.model_ids else "",
            "server_time": datetime.now(UTC),
        }


class ErrorDetail(BaseModel):
    code: str = Field(examples=["PENDING_DECISION_LIMIT"])
    message: str
    detail: dict = Field(default_factory=dict)
    request_id: str


class ErrorResponse(BaseModel):
    """The single error shape. Clients switch on `error.code`."""

    error: ErrorDetail


class HealthResponse(BaseModel):
    status: str = Field(examples=["ok"])
    dataset_mode: str


class ReadyResponse(BaseModel):
    status: str
    database: str
    migration_version: str | None
    storage: str
    dataset_mode: str


class ConfigResponse(BaseModel):
    """Runtime config the apps fetch at launch.

    Thresholds live here so they can be tuned with a restart instead of a
    30-minute mobile build. A client must never hardcode a band boundary.
    """

    dataset_mode: str
    allowed_model_ids: list[str]
    quality_floor: float
    bands: dict[str, float]
    ambiguity_gap: float
    top_k_default: int
    top_k_min: int
    top_k_max: int
    pending_decision_limit: int
    search_expiry_minutes: int
    reason_codes: list[str]
    advisory: str
    server_time: datetime
