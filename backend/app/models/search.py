"""Search request/response contracts.

NOTE FOR ANY FUTURE EDITOR: this module must never gain a field named
`is_match`, `matched`, or `identity_confirmed`. The API returns ranked
candidates with scores; asserting an identification is not a question the
machine is permitted to answer. tests/test_search_contract.py enforces this
against the live OpenAPI schema.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

REASON_CODES = (
    "routine_check",
    "suspicious_conduct",
    "warrant_service",
    "missing_person",
    "post_incident",
    "training",
    "browse",
)

ReasonCode = Literal[
    "routine_check",
    "suspicious_conduct",
    "warrant_service",
    "missing_person",
    "post_incident",
    "training",
    "browse",
]

Decision = Literal["CONFIRMED", "NO_MATCH", "INCONCLUSIVE", "ABORTED"]
Band = Literal["NO_MATCH", "WEAK", "REVIEW", "STRONG"]


class Quality(BaseModel):
    """On-device quality report. Computed where the camera is, before the
    network — a rejected capture never leaves the phone."""

    score: float = Field(ge=0, le=1)
    det_score: float | None = Field(default=None, ge=0, le=1)
    blur: float | None = Field(default=None, ge=0)
    yaw: float | None = None
    pitch: float | None = None
    face_px: int | None = Field(default=None, ge=0)


class Geo(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Length, finiteness and L2 norm are checked in services/embedding.py so
    # each failure gets a specific error code rather than a generic 422.
    embedding: list[float] = Field(min_length=1)
    model_id: str
    quality: Quality
    reason_code: ReasonCode
    top_k: int | None = Field(default=None, ge=1, le=10)
    geo: Geo | None = None


class RecordSummary(BaseModel):
    case_count: int
    convictions: int
    latest: str | None


class Candidate(BaseModel):
    rank: int
    person_id: UUID
    # Masked, never the full name. Four of five candidates are innocent and
    # must not be identified to the officer.
    masked_name: str
    age_band: str | None
    district: str | None
    similarity: float
    band: Band
    mugshot_url: str | None
    record_summary: RecordSummary


class SearchResponse(BaseModel):
    search_id: UUID
    status: Literal["PENDING_DECISION"]
    expires_at: datetime
    candidates: list[Candidate]
    score_gap: float | None
    ambiguous: bool
    threshold_in_effect: float
    bands: dict[str, float]
    advisory: str

    dataset_mode: str
    model_id: str
    server_time: datetime


class SearchDetail(BaseModel):
    search_id: UUID
    status: str
    officer_id: str
    reason_code: str
    model_id: str
    probe_quality: float
    threshold_in_effect: float
    bands: dict[str, float]
    top_score: float | None
    score_gap: float | None
    candidate_count: int
    created_at: datetime
    candidates: list[Candidate]
    decision: DecisionDetail | None

    dataset_mode: str
    server_time: datetime


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Decision
    confirmed_rank: int | None = Field(default=None, ge=1, le=10)
    note: str | None = Field(default=None, max_length=2000)
    quality_override: bool = False
    # Time from render to tap. A cluster of sub-second confirmations is not
    # careful review, and detecting that costs one integer.
    latency_ms: int | None = Field(default=None, ge=0)


class DecisionDetail(BaseModel):
    decision: str
    confirmed_person_id: UUID | None
    confirmed_rank: int | None
    officer_id: str
    note: str | None
    quality_override: bool
    decided_at: datetime
    latency_ms: int | None


class PendingSearch(BaseModel):
    search_id: UUID
    officer_id: str
    reason_code: str
    candidate_count: int
    top_score: float | None
    created_at: datetime
    expires_at: datetime
    age_seconds: int


class PendingResponse(BaseModel):
    pending: list[PendingSearch]
    limit: int
    dataset_mode: str
    server_time: datetime


SearchDetail.model_rebuild()
