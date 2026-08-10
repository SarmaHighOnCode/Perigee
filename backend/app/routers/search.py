"""Search, candidates and the mandatory human decision.

This router implements the one interaction the whole system exists for:
a vector goes in, ranked candidates come out, and NOTHING closes until a
human adjudicates.

Contract: docs/03-API-SPEC.md §2.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Response, status

from app.config import Settings, get_settings
from app.db import is_pending_limit_violation
from app.dependencies import (
    RequestContext,
    get_pool,
    rate_limit_read,
    rate_limit_search,
    rate_limit_write,
    request_context,
)
from app.errors import (
    DecisionAlreadyRecorded,
    MalformedRequest,
    NotFound,
    PendingDecisionLimit,
    PurposeNotAuthorised,
    SearchExpired,
)
from app.models.search import (
    Candidate,
    DecisionDetail,
    DecisionRequest,
    PendingResponse,
    PendingSearch,
    RecordSummary,
    SearchDetail,
    SearchRequest,
    SearchResponse,
)
from app.repositories import person as person_repo
from app.repositories import search as search_repo
from app.services import vector_search
from app.services.audit_chain import append as audit_append
from app.services.embedding import validate_embedding
from app.services.object_storage import get_storage
from app.services.scoring import (
    ADVISORY,
    ScoredCandidate,
    assemble_candidates,
    clamp_top_k,
    is_ambiguous,
    score_gap,
)

router = APIRouter(prefix="/v1", tags=["search"])


def _expires_at(created_at: datetime, settings: Settings) -> datetime:
    return created_at + timedelta(minutes=settings.search_expiry_minutes)


async def _build_candidates(
    conn: asyncpg.Connection,
    scored: list[ScoredCandidate],
    settings: Settings,
) -> list[Candidate]:
    """Attach masked identity and a short-lived mugshot URL to each candidate."""
    if not scored:
        return []

    summaries = await person_repo.summarise(conn, [UUID(c.person_id) for c in scored])
    storage = get_storage(settings)

    out: list[Candidate] = []
    for rank, c in enumerate(scored, start=1):
        info = summaries.get(c.person_id, {})
        out.append(
            Candidate(
                rank=rank,
                person_id=UUID(c.person_id),
                masked_name=info.get("masked_name") or "UNKNOWN",
                age_band=info.get("age_band"),
                district=info.get("district"),
                similarity=c.similarity,
                band=c.band,
                mugshot_url=storage.presign_get_safe(info.get("mugshot_key")),
                record_summary=RecordSummary(
                    case_count=int(info.get("case_count", 0)),
                    convictions=int(info.get("convictions", 0)),
                    latest=info.get("latest"),
                ),
            )
        )
    return out


@router.post(
    "/search",
    response_model=SearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search enrolled faces by embedding",
    description=(
        "Accepts a 512-d L2-normalised embedding and returns RANKED CANDIDATES. "
        "Never returns a match: there is no `is_match` field, because asserting "
        "an identification is not a question this system is permitted to answer. "
        "The search opens in PENDING_DECISION and does not close until a human "
        "records a decision."
    ),
    dependencies=[Depends(rate_limit_search)],
)
async def create_search(
    payload: SearchRequest,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> SearchResponse:
    # Specific errors so the client can coach the officer, rather than a
    # generic 422 that tells them nothing actionable.
    validate_embedding(payload.embedding, payload.model_id, payload.quality.score, settings)

    top_k = clamp_top_k(payload.top_k, settings)

    async with pool.acquire() as conn:
        # Housekeeping: abandoned searches must not permanently consume a
        # device's pending-decision budget.
        await search_repo.expire_stale(conn, settings.search_expiry_minutes)

        # Fast, informative 429 before doing any work. The DB trigger is still
        # the authority — this only produces a better error body.
        pending = await search_repo.list_pending(conn, ctx.device.device_id)
        if len(pending) >= settings.search_pending_limit:
            raise PendingDecisionLimit(
                f"{len(pending)} searches await adjudication",
                detail={"open_search_ids": [str(p["search_id"]) for p in pending]},
            )

        ranked = await vector_search.search(conn, payload.embedding, payload.model_id, top_k)
        scored = assemble_candidates(ranked, top_k, settings)

        similarities = [c.similarity for c in scored]
        gap = score_gap(similarities)
        top_score = similarities[0] if similarities else None

        async with conn.transaction():
            try:
                search_id = await search_repo.create_search_event(
                    conn,
                    device_id=ctx.device.device_id,
                    officer_id=ctx.officer_id,
                    reason_code=payload.reason_code,
                    model_id=payload.model_id,
                    probe_quality=payload.quality.score,
                    threshold_in_effect=settings.band_weak,
                    band_config=settings.band_config,
                    probe_embedding=(
                        payload.embedding if settings.retain_probe_embedding else None
                    ),
                    geo_lat=payload.geo.lat if payload.geo else None,
                    geo_lon=payload.geo.lon if payload.geo else None,
                    top_score=top_score,
                    score_gap=gap,
                    candidate_count=len(scored),
                )
            except asyncpg.exceptions.CheckViolationError as exc:
                if is_pending_limit_violation(exc):
                    raise PendingDecisionLimit(
                        "Searches await adjudication",
                        detail={"open_search_ids": [str(p["search_id"]) for p in pending]},
                    ) from exc
                raise

            await search_repo.insert_candidates(conn, search_id, scored)

            # Field names and scores only. Never an embedding, never a name.
            await audit_append(
                conn,
                actor_type="officer",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="search.executed",
                subject_type="search",
                subject_id=str(search_id),
                payload={
                    "model_id": payload.model_id,
                    "quality": round(payload.quality.score, 4),
                    "reason_code": payload.reason_code,
                    "threshold_in_effect": settings.band_weak,
                    "candidate_count": len(scored),
                    "candidates": [
                        {"person_id": c.person_id, "similarity": c.similarity, "band": c.band}
                        for c in scored
                    ],
                },
            )

        created_at = datetime.now(UTC)
        candidates = await _build_candidates(conn, scored, settings)

    return SearchResponse(
        search_id=search_id,
        status="PENDING_DECISION",
        expires_at=_expires_at(created_at, settings),
        candidates=candidates,
        score_gap=gap,
        ambiguous=is_ambiguous(gap, settings),
        threshold_in_effect=settings.band_weak,
        bands=settings.band_config,
        advisory=ADVISORY,
        dataset_mode=settings.dataset_mode,
        model_id=payload.model_id,
        server_time=datetime.now(UTC),
    )


@router.get(
    "/search/pending",
    response_model=PendingResponse,
    summary="Searches awaiting adjudication on this device",
    dependencies=[Depends(rate_limit_read)],
)
async def list_pending(
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> PendingResponse:
    async with pool.acquire() as conn:
        rows = await search_repo.list_pending(conn, ctx.device.device_id)

    now = datetime.now(UTC)
    return PendingResponse(
        pending=[
            PendingSearch(
                search_id=r["search_id"],
                officer_id=r["officer_id"],
                reason_code=r["reason_code"],
                candidate_count=r["candidate_count"],
                top_score=r["top_score"],
                created_at=r["created_at"],
                expires_at=_expires_at(r["created_at"], settings),
                age_seconds=int((now - r["created_at"]).total_seconds()),
            )
            for r in rows
        ],
        limit=settings.search_pending_limit,
        dataset_mode=settings.dataset_mode,
        server_time=now,
    )


@router.get(
    "/search/{search_id}",
    response_model=SearchDetail,
    summary="Retrieve a search with its frozen candidates and decision",
    dependencies=[Depends(rate_limit_read)],
)
async def get_search(
    search_id: UUID,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> SearchDetail:
    async with pool.acquire() as conn:
        row = await search_repo.get_search(conn, search_id)
        if row is None:
            raise NotFound("Search not found")

        candidate_rows = await search_repo.get_candidates(conn, search_id)
        decision_row = await search_repo.get_decision(conn, search_id)

        # Scores are read back as stored, never recomputed: what the officer
        # saw is what the record shows, permanently.
        scored = [
            ScoredCandidate(
                person_id=str(r["person_id"]),
                embedding_id=str(r["embedding_id"]),
                similarity=float(r["similarity"]),
                band=r["band"],
            )
            for r in candidate_rows
        ]
        candidates = await _build_candidates(conn, scored, settings)

    return SearchDetail(
        search_id=row["search_id"],
        status=row["status"],
        officer_id=row["officer_id"],
        reason_code=row["reason_code"],
        model_id=row["model_id"],
        probe_quality=row["probe_quality"],
        threshold_in_effect=row["threshold_in_effect"],
        bands=row["band_config"],
        top_score=row["top_score"],
        score_gap=row["score_gap"],
        candidate_count=row["candidate_count"],
        created_at=row["created_at"],
        candidates=candidates,
        decision=DecisionDetail(**dict(decision_row)) if decision_row else None,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.post(
    "/search/{search_id}/decision",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Record the human decision (mandatory, write-once)",
    description=(
        "A search is not complete without this. Write-once: a second attempt "
        "returns 409. A decision cannot be revised — run a new search instead, "
        "because editable decisions are not evidence."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def record_decision(
    search_id: UUID,
    payload: DecisionRequest,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    async with pool.acquire() as conn:
        row = await search_repo.get_search(conn, search_id)
        if row is None:
            raise NotFound("Search not found")

        if row["status"] == "EXPIRED":
            raise SearchExpired("Search expired before a decision was recorded")

        if await search_repo.get_decision(conn, search_id) is not None:
            raise DecisionAlreadyRecorded("A decision has already been recorded for this search")

        confirmed_person_id: UUID | None = None
        if payload.decision == "CONFIRMED":
            if payload.confirmed_rank is None:
                raise MalformedRequest("confirmed_rank is required when decision is CONFIRMED")
            match = next(
                (
                    c
                    for c in await search_repo.get_candidates(conn, search_id)
                    if c["rank"] == payload.confirmed_rank
                ),
                None,
            )
            if match is None:
                raise MalformedRequest(
                    f"rank {payload.confirmed_rank} was not among this search's candidates"
                )
            confirmed_person_id = match["person_id"]
        elif payload.confirmed_rank is not None:
            raise MalformedRequest("confirmed_rank is only valid when decision is CONFIRMED")

        async with conn.transaction():
            try:
                await search_repo.record_decision(
                    conn,
                    search_id=search_id,
                    decision=payload.decision,
                    confirmed_person_id=confirmed_person_id,
                    confirmed_rank=payload.confirmed_rank,
                    officer_id=ctx.officer_id,
                    note=payload.note,
                    quality_override=payload.quality_override,
                    latency_ms=payload.latency_ms,
                )
            except asyncpg.exceptions.UniqueViolationError as exc:
                raise DecisionAlreadyRecorded(
                    "A decision has already been recorded for this search"
                ) from exc

            await audit_append(
                conn,
                actor_type="officer",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="search.decided",
                subject_type="search",
                subject_id=str(search_id),
                payload={
                    "decision": payload.decision,
                    "confirmed_person_id": (
                        str(confirmed_person_id) if confirmed_person_id else None
                    ),
                    "confirmed_rank": payload.confirmed_rank,
                    "quality_override": payload.quality_override,
                    "latency_ms": payload.latency_ms,
                },
            )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def assert_purpose_authorised(
    conn: asyncpg.Connection, person_id: UUID, search_id: UUID | None
) -> str:
    """Purpose binding for GET /v1/person/{id}.

    Full PII requires proof of a confirmed identification. Identification is
    the only door into a record, and walking through it leaves a mark.

    `reason_code='browse'` is the deliberate valve: legitimate investigative
    browsing exists, and a control with no valve gets circumvented rather than
    obeyed. It works, and it is logged under a distinct audit action.
    """
    if search_id is None:
        raise PurposeNotAuthorised(
            "Access to a person record requires a search_id with a CONFIRMED decision",
            detail={"hint": "pass ?search_id=<uuid>"},
        )

    context = await search_repo.confirmed_person_for(conn, search_id)
    if context is None:
        raise PurposeNotAuthorised("Referenced search does not exist", detail={})

    if context["reason_code"] == "browse":
        return "browse"

    if context["decision"] != "CONFIRMED":
        raise PurposeNotAuthorised(
            "Referenced search has no CONFIRMED decision",
            detail={"decision": context["decision"]},
        )

    if context["confirmed_person_id"] != person_id:
        raise PurposeNotAuthorised(
            "Referenced search confirmed a different person",
            detail={},
        )

    return "confirmed"
