"""Case linking and relationship contracts.

Perigee Enroll collects both, and until now had nowhere to send them: cases and
relationships were staged locally and never left the handset. That meant an
enrolled person arrived with no case history and no graph edges.

Contract note: these endpoints are NOT in docs/03-API-SPEC.md. They were found
missing when the Enroll app was wired up. See docs/CONTRACT-NOTES.md #9.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.person import PersonRole

# `co_accused` is deliberately absent. It is DERIVED from shared cases by
# scripts/compute_edges.py, and a hand-written one would be silently
# overwritten on the next rebuild. Link the case instead and let the edge fall
# out of the evidence.
ManualEdgeType = Literal["shared_address", "shared_phone", "same_mo", "family", "known_associate"]

CaseStatus = Literal["open", "chargesheeted", "convicted", "acquitted", "closed"]


class CaseSummary(BaseModel):
    """One row of the case picker in Enroll."""

    case_id: UUID
    fir_number: str
    station: str
    district: str
    registered_on: date
    status: CaseStatus
    offence_title: str | None
    ipc_section: str | None
    bns_section: str | None
    linked_persons: int


class CaseListResponse(BaseModel):
    cases: list[CaseSummary]
    count: int
    truncated: bool
    dataset_mode: str
    server_time: datetime


class CaseLinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: UUID
    # 'accused' and 'convicted' are recorded separately and never summed.
    # Conflating them is how a screening tool becomes an accusation engine.
    role: PersonRole


class CaseLinkCreated(BaseModel):
    person_id: UUID
    case_id: UUID
    role: PersonRole
    already_linked: bool
    dataset_mode: str
    server_time: datetime


class RelationshipCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_person_id: UUID
    edge_type: ManualEdgeType
    # NOT optional and NOT allowed to be empty. An edge asserting two people are
    # connected without a citable case file is an unfalsifiable accusation —
    # docs/11-GRAPH-INTELLIGENCE.md §1.
    evidence_case_ids: list[UUID] = Field(min_length=1)
    weight: float | None = Field(default=None, ge=0, le=1)


class RelationshipCreated(BaseModel):
    edge_id: UUID
    src_person_id: UUID
    dst_person_id: UUID
    edge_type: str
    weight: float
    evidence_case_ids: list[UUID]
    already_existed: bool
    dataset_mode: str
    server_time: datetime
