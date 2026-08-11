"""Case linking and relationship writes (Perigee Enroll).

These close a real gap rather than implementing a spec: Enroll collected case
links and relationships and had nowhere to send them, so an enrolled person
arrived with no history and no graph edges. Recorded in docs/CONTRACT-NOTES.md #9.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query, status

from app.config import Settings, get_settings
from app.dependencies import (
    RequestContext,
    get_pool,
    rate_limit_read,
    rate_limit_write,
    request_context,
)
from app.errors import MalformedRequest, NotFound
from app.models.records import (
    CaseLinkCreate,
    CaseLinkCreated,
    CaseListResponse,
    CaseSummary,
    RelationshipCreate,
    RelationshipCreated,
)
from app.repositories import records as repo
from app.services.audit_chain import append as audit_append

router = APIRouter(prefix="/v1", tags=["records"])

MAX_CASE_PAGE = 100
MAX_EVIDENCE = 20


@router.get(
    "/cases",
    response_model=CaseListResponse,
    summary="List cases for linking",
    description=(
        "Backs the case picker in Enroll. Returns case metadata only — no "
        "person names — so browsing the case list discloses nothing about who "
        "is on file."
    ),
    dependencies=[Depends(rate_limit_read), Depends(request_context)],
)
async def list_cases(
    q: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=25, ge=1, le=MAX_CASE_PAGE),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> CaseListResponse:
    async with pool.acquire() as conn:
        rows = await repo.list_cases(conn, q, district, limit)

    truncated = len(rows) > limit
    rows = rows[:limit]

    return CaseListResponse(
        cases=[CaseSummary(**dict(r)) for r in rows],
        count=len(rows),
        truncated=truncated,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.post(
    "/person/{person_id}/cases",
    response_model=CaseLinkCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Link an enrolled person to an existing case",
    description=(
        "Idempotent: re-submitting a draft after a dropped connection will not "
        "duplicate the link. A person may legitimately hold more than one role "
        "on the same case, so the role is part of the key."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def link_case(
    person_id: UUID,
    payload: CaseLinkCreate,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> CaseLinkCreated:
    async with pool.acquire() as conn:
        if not await repo.person_exists(conn, person_id):
            raise NotFound("Person not found")

        if await repo.missing_cases(conn, [payload.case_id]):
            raise NotFound("Case not found")

        async with conn.transaction():
            already = await repo.link_person_case(conn, person_id, payload.case_id, payload.role)
            await audit_append(
                conn,
                actor_type="operator",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="person.case_linked",
                subject_type="person",
                subject_id=str(person_id),
                payload={
                    "case_id": str(payload.case_id),
                    "role": payload.role,
                    "already_linked": already,
                },
            )

    return CaseLinkCreated(
        person_id=person_id,
        case_id=payload.case_id,
        role=payload.role,
        already_linked=already,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.post(
    "/person/{person_id}/relationships",
    response_model=RelationshipCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Record an evidenced relationship between two people",
    description=(
        "Every edge must cite at least one real case. An edge asserting two "
        "people are connected without a citable file is an unfalsifiable "
        "accusation.\n\n"
        "`co_accused` cannot be created here: it is DERIVED from shared cases "
        "by compute_edges.py and a hand-written one would be silently "
        "overwritten on the next rebuild. Link the case instead and let the "
        "edge fall out of the evidence."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def create_relationship(
    person_id: UUID,
    payload: RelationshipCreate,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> RelationshipCreated:
    if payload.target_person_id == person_id:
        raise MalformedRequest("a person cannot be related to themselves")

    if len(payload.evidence_case_ids) > MAX_EVIDENCE:
        raise MalformedRequest(
            f"at most {MAX_EVIDENCE} evidence case ids",
            detail={"supplied": len(payload.evidence_case_ids)},
        )

    unique_evidence = list(dict.fromkeys(payload.evidence_case_ids))

    async with pool.acquire() as conn:
        for pid in (person_id, payload.target_person_id):
            if not await repo.person_exists(conn, pid):
                raise NotFound(f"Person {pid} not found")

        missing = await repo.missing_cases(conn, unique_evidence)
        if missing:
            raise MalformedRequest(
                "evidence references cases that do not exist",
                detail={"missing_case_ids": [str(c) for c in missing]},
            )

        async with conn.transaction():
            row, existed = await repo.create_relationship(
                conn,
                person_id,
                payload.target_person_id,
                payload.edge_type,
                unique_evidence,
                payload.weight,
            )
            await repo.refresh_degree(conn, [person_id, payload.target_person_id])
            await audit_append(
                conn,
                actor_type="operator",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="person.relationship_recorded",
                subject_type="person",
                subject_id=str(person_id),
                payload={
                    "target_person_id": str(payload.target_person_id),
                    "edge_type": payload.edge_type,
                    "evidence_count": len(unique_evidence),
                    "already_existed": existed,
                },
            )

    return RelationshipCreated(
        edge_id=row["edge_id"],
        src_person_id=row["src_person_id"],
        dst_person_id=row["dst_person_id"],
        edge_type=row["edge_type"],
        weight=round(float(row["weight"]), 4),
        evidence_case_ids=list(row["evidence_case_ids"]),
        already_existed=existed,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )
