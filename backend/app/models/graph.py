"""Graph and audit response contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class GraphNode(BaseModel):
    person_id: UUID
    masked_name: str
    age_band: str | None
    district: str | None
    hop: int
    degree: int
    betweenness: float
    community_id: int | None
    case_count: int


class GraphEdge(BaseModel):
    src: UUID
    dst: UUID
    edge_type: str
    weight: float
    # An edge without a citable case file is an unfalsifiable accusation.
    evidence_case_ids: list[UUID]
    evidence_count: int
    # `same_mo` is inferential and rendered distinctly; it is suppressed
    # entirely unless a documented edge exists for the same pair.
    inferred: bool


class Community(BaseModel):
    community_id: int
    size: int
    label: str


class GraphResponse(BaseModel):
    root: UUID
    depth: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    # Surfaced honestly in the UI: a silently-truncated network graph is a
    # misleading one.
    truncated: bool
    communities: list[Community]

    dataset_mode: str
    server_time: datetime


class AuditEntry(BaseModel):
    seq: int
    occurred_at: datetime
    actor_type: str
    actor_id: str
    action: str
    subject_type: str
    subject_id: str
    payload: dict
    prev_hash: str
    row_hash: str


class AuditListResponse(BaseModel):
    entries: list[AuditEntry]
    count: int
    dataset_mode: str
    server_time: datetime


class AuditVerifyResponse(BaseModel):
    verified: bool
    from_seq: int | None
    to_seq: int | None
    checked: int
    first_bad_seq: int | None
    head_hash: str | None
    duration_ms: int
    dataset_mode: str
    server_time: datetime


class PublicStats(BaseModel):
    """Counts only. No PII, ever."""

    persons: int
    cases: int
    embeddings: int
    edges: int
    searches: int
    decisions: int
    dataset_mode: str
    server_time: datetime


class ReleaseInfo(BaseModel):
    app: str
    version: str
    apk_url: str | None
    sha256: str | None
    size_bytes: int | None
    notes: str | None


class PublicReleases(BaseModel):
    releases: list[ReleaseInfo]
    # Android only: iOS side-loading needs a paid Apple developer account.
    platform_note: str
    dataset_mode: str
    server_time: datetime
