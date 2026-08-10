"""Person, media and enrolment contracts (Perigee Enroll)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Gender = Literal["M", "F", "O", "U"]
AgeBand = Literal["18-25", "26-35", "36-45", "46-60", "60+", "UNKNOWN"]
CaptureAngle = Literal["frontal", "left", "right", "up", "down"]
PersonRole = Literal["accused", "convicted", "suspect", "victim", "witness", "complainant"]


class PersonCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list, max_length=20)
    dob: date | None = None
    gender: Gender | None = None
    address_line: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=32)
    age_band: AgeBand | None = None
    district: str | None = Field(default=None, max_length=120)
    # Optional: derived from full_name when omitted.
    masked_name: str | None = None


class PersonCreated(BaseModel):
    person_id: UUID
    masked_name: str
    dataset_mode: str
    server_time: datetime


class EmbeddingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    embedding: list[float] = Field(min_length=1)
    model_id: str
    # Enrolment floor is stricter than search (0.60 vs 0.35): a bad enrolment
    # poisons every future search against that person.
    quality_score: float = Field(ge=0, le=1)
    det_score: float | None = Field(default=None, ge=0, le=1)
    yaw: float | None = None
    pitch: float | None = None
    media_id: UUID | None = None


class EmbeddingCreated(BaseModel):
    embedding_id: UUID
    person_id: UUID
    model_id: str
    dataset_mode: str
    server_time: datetime


class MediaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capture_angle: CaptureAngle = "frontal"
    content_type: Literal["image/jpeg", "image/png"] = "image/jpeg"
    is_primary: bool = False


class MediaPresigned(BaseModel):
    """Two-step upload: the client PUTs bytes straight to R2, then commits.

    Image bytes never transit this service.
    """

    media_id: UUID
    upload_url: str
    method: str
    expires_in: int
    max_bytes: int
    required_headers: dict[str, str]
    dataset_mode: str
    server_time: datetime


class MediaCommit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sha256: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    bytes: int = Field(gt=0)
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    # Asserted by the client and re-verified server-side. Mugshot EXIF carries
    # GPS and a device serial; neither belongs in a criminal record.
    exif_stripped: bool = True


class MediaCommitted(BaseModel):
    media_id: UUID
    person_id: UUID
    committed: bool
    bytes: int
    dataset_mode: str
    server_time: datetime


class MediaRef(BaseModel):
    media_id: UUID
    url: str | None
    angle: str
    is_primary: bool


class OffenceRef(BaseModel):
    # Both citations, always. Officers work across IPC and BNS daily.
    ipc_section: str | None
    bns_section: str | None
    title: str
    category: str
    severity: str


class CaseRef(BaseModel):
    case_id: UUID
    fir_number: str
    station: str
    district: str
    # Surfaced per case and NEVER aggregated: one conviction plus two withdrawn
    # accusations is not "3 cases".
    role: PersonRole
    offence: OffenceRef | None
    registered_on: date
    status: str


class GraphSummary(BaseModel):
    degree: int
    community_id: int | None
    immediate_associates: int


class PersonDetail(BaseModel):
    """Full PII. Reachable only via a CONFIRMED decision, or an explicit
    `browse` search which is logged under a distinct audit action."""

    person_id: UUID
    full_name: str
    aliases: list[str]
    dob: date | None
    gender: str | None
    district: str | None
    status: str
    media: list[MediaRef]
    cases: list[CaseRef]
    graph_summary: GraphSummary

    dataset_mode: str
    server_time: datetime
