"""Person enrolment (Perigee Enroll) and purpose-bound record access."""

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
from app.models.person import (
    CaseRef,
    EmbeddingCreate,
    EmbeddingCreated,
    GraphSummary,
    MediaCommit,
    MediaCommitted,
    MediaCreate,
    MediaDirectCreate,
    MediaPresigned,
    MediaRef,
    OffenceRef,
    PersonCreate,
    PersonCreated,
    PersonDetail,
)
from app.repositories import person as person_repo
from app.routers.search import assert_purpose_authorised
from app.services.audit_chain import append as audit_append
from app.services.embedding import validate_embedding
from app.services.media_bytes import to_data_uri
from app.services.object_storage import get_storage

router = APIRouter(prefix="/v1", tags=["person"])

# Stricter than the search floor (0.35). A bad enrolment poisons every future
# search against that person, and unlike a bad probe it is never retried.
ENROLMENT_QUALITY_FLOOR = 0.60


@router.post(
    "/person",
    response_model=PersonCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Enrol a person",
    dependencies=[Depends(rate_limit_write)],
)
async def create_person(
    payload: PersonCreate,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> PersonCreated:
    async with pool.acquire() as conn, conn.transaction():
        row = await person_repo.create_person(conn, payload.model_dump(), settings.dataset_mode)
        await audit_append(
            conn,
            actor_type="operator",
            actor_id=ctx.officer_id,
            device_id=ctx.device.device_id,
            action="person.enrolled",
            subject_type="person",
            subject_id=str(row["person_id"]),
            # Field NAMES only, never values.
            payload={"fields": sorted(payload.model_dump(exclude_none=True).keys())},
        )

    return PersonCreated(
        person_id=row["person_id"],
        masked_name=row["masked_name"],
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.post(
    "/person/{person_id}/embedding",
    response_model=EmbeddingCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Attach a face embedding to an enrolled person",
    description=(
        "Embeddings are computed ON-DEVICE and posted as vectors, exactly like "
        "search probes. Enrolment applies a stricter quality floor (0.60) with "
        "no override, because a bad enrolment degrades every future search."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def add_embedding(
    person_id: UUID,
    payload: EmbeddingCreate,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> EmbeddingCreated:
    validate_embedding(payload.embedding, payload.model_id, payload.quality_score, settings)

    if payload.quality_score < ENROLMENT_QUALITY_FLOOR:
        from app.errors import QualityBelowFloor

        raise QualityBelowFloor(
            f"enrolment requires quality >= {ENROLMENT_QUALITY_FLOOR:.2f}, "
            f"got {payload.quality_score:.2f}",
            detail={"floor": ENROLMENT_QUALITY_FLOOR, "quality": payload.quality_score},
        )

    async with pool.acquire() as conn:
        if await person_repo.get_person(conn, person_id) is None:
            raise NotFound("Person not found")

        async with conn.transaction():
            row = await person_repo.insert_embedding(
                conn,
                person_id,
                payload.embedding,
                payload.model_id,
                payload.quality_score,
                payload.det_score,
                payload.yaw,
                payload.pitch,
                payload.media_id,
            )
            await audit_append(
                conn,
                actor_type="operator",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="person.embedding_added",
                subject_type="person",
                subject_id=str(person_id),
                payload={
                    "model_id": payload.model_id,
                    "quality": round(payload.quality_score, 4),
                },
            )

    return EmbeddingCreated(
        embedding_id=row["embedding_id"],
        person_id=person_id,
        model_id=payload.model_id,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.post(
    "/person/{person_id}/media",
    response_model=MediaPresigned,
    status_code=status.HTTP_201_CREATED,
    summary="Reserve a media slot and get a presigned upload URL",
    description=(
        "Two-step upload. The client PUTs image bytes DIRECTLY to object "
        "storage, then calls the commit endpoint. Bytes never transit this "
        "service — proxying uploads through a 512 MB instance is how it dies."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def create_media(
    person_id: UUID,
    payload: MediaCreate,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> MediaPresigned:
    storage = get_storage(settings)

    async with pool.acquire() as conn:
        if await person_repo.get_person(conn, person_id) is None:
            raise NotFound("Person not found")

        from uuid import uuid4

        key = storage.build_key(person_id, uuid4())
        presigned = storage.presign_put(key, payload.content_type)

        async with conn.transaction():
            row = await person_repo.create_media(
                conn, person_id, key, payload.capture_angle, payload.is_primary
            )

    return MediaPresigned(
        media_id=row["media_id"],
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
        **presigned,
    )


@router.post(
    "/person/{person_id}/media/{media_id}/commit",
    response_model=MediaCommitted,
    summary="Confirm an upload completed",
    description=(
        "Verifies the object actually exists in storage and reads its TRUE "
        "size. A client-reported byte count is not trusted."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def commit_media(
    person_id: UUID,
    media_id: UUID,
    payload: MediaCommit,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> MediaCommitted:
    storage = get_storage(settings)

    async with pool.acquire() as conn:
        row = await person_repo.get_media_row(conn, person_id, media_id)
        if row is None:
            raise NotFound("Media not found for this person")

        head = storage.head(row["r2_key"])
        actual_bytes = head["bytes"]

        if actual_bytes > settings.media_max_bytes:
            storage.delete(row["r2_key"])
            raise MalformedRequest(
                f"uploaded object is {actual_bytes} bytes, limit is {settings.media_max_bytes}",
                detail={"bytes": actual_bytes, "max_bytes": settings.media_max_bytes},
            )

        async with conn.transaction():
            await person_repo.commit_media(
                conn,
                media_id,
                payload.sha256,
                actual_bytes,
                payload.width,
                payload.height,
                payload.exif_stripped,
            )
            await audit_append(
                conn,
                actor_type="operator",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="person.media_committed",
                subject_type="person",
                subject_id=str(person_id),
                payload={"media_id": str(media_id), "bytes": actual_bytes},
            )

    return MediaCommitted(
        media_id=media_id,
        person_id=person_id,
        committed=True,
        bytes=actual_bytes,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.post(
    "/person/{person_id}/media/direct",
    response_model=MediaCommitted,
    status_code=status.HTTP_201_CREATED,
    summary="Store a mugshot inline, for a deployment with no object storage",
    description=(
        "Presign + upload + commit collapsed into one call. Only sensible at "
        "small scale (tens of people, not thousands) - image bytes DO transit "
        "this service here, which is exactly what the R2 path avoids. Exists "
        "because Cloudflare requires a payment method on file for R2 even "
        "within its free tier, and this deployment has none."
    ),
    dependencies=[Depends(rate_limit_write)],
)
async def create_media_direct(
    person_id: UUID,
    payload: MediaDirectCreate,
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> MediaCommitted:
    import base64
    import hashlib

    try:
        # binascii.Error (the decoder's actual exception) subclasses
        # ValueError, so catching ValueError alone is exhaustive.
        image_bytes = base64.b64decode(payload.image_base64, validate=True)
    except ValueError as exc:
        raise MalformedRequest("image_base64 is not valid base64") from exc

    if not image_bytes:
        raise MalformedRequest("image_base64 decoded to zero bytes")

    if len(image_bytes) > settings.media_max_bytes:
        raise MalformedRequest(
            f"image is {len(image_bytes)} bytes, limit is {settings.media_max_bytes}",
            detail={"bytes": len(image_bytes), "max_bytes": settings.media_max_bytes},
        )

    # The client's assertion is re-derived, not trusted - the same principle
    # the R2 path applies via storage.head()'s true byte count.
    actual_sha256 = hashlib.sha256(image_bytes).hexdigest()
    if actual_sha256.lower() != payload.sha256.lower():
        raise MalformedRequest(
            "sha256 does not match the decoded image bytes",
            detail={"expected": payload.sha256, "actual": actual_sha256},
        )

    async with pool.acquire() as conn:
        if await person_repo.get_person(conn, person_id) is None:
            raise NotFound("Person not found")

        async with conn.transaction():
            row = await person_repo.create_media_direct(
                conn,
                person_id,
                image_bytes,
                payload.content_type,
                payload.capture_angle,
                payload.is_primary,
                actual_sha256,
                payload.width,
                payload.height,
                payload.exif_stripped,
            )
            await audit_append(
                conn,
                actor_type="operator",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="person.media_committed",
                subject_type="person",
                subject_id=str(person_id),
                payload={"media_id": str(row["media_id"]), "bytes": len(image_bytes)},
            )

    return MediaCommitted(
        media_id=row["media_id"],
        person_id=person_id,
        committed=True,
        bytes=len(image_bytes),
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.get(
    "/person/{person_id}",
    response_model=PersonDetail,
    summary="Full person record (purpose-bound)",
    description=(
        "PURPOSE BINDING: requires `search_id` referencing a search with a "
        "CONFIRMED decision for this exact person, or a search whose "
        "reason_code was `browse` (which is permitted and logged distinctly). "
        "Without it: 403 PURPOSE_NOT_AUTHORISED. This is what stops the app "
        "being used as a general-purpose PII browser."
    ),
    dependencies=[Depends(rate_limit_read)],
)
async def get_person(
    person_id: UUID,
    search_id: UUID | None = Query(default=None),
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> PersonDetail:
    storage = get_storage(settings)

    async with pool.acquire() as conn:
        basis = await assert_purpose_authorised(conn, person_id, search_id)

        row = await person_repo.get_person(conn, person_id)
        if row is None:
            raise NotFound("Person not found")

        media_rows = await person_repo.get_media(conn, person_id)
        case_rows = await person_repo.get_cases(conn, person_id)
        graph = await person_repo.get_graph_summary(conn, person_id)

        async with conn.transaction():
            await audit_append(
                conn,
                actor_type="officer",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                # Distinct action for browse access so it stands out in review.
                action="person.viewed" if basis == "confirmed" else "person.browsed",
                subject_type="person",
                subject_id=str(person_id),
                payload={"search_id": str(search_id), "basis": basis},
            )

    return PersonDetail(
        person_id=row["person_id"],
        full_name=row["full_name"],
        aliases=list(row["aliases"] or []),
        dob=row["dob"],
        gender=row["gender"],
        district=row["district"],
        status=row["status"],
        media=[
            MediaRef(
                media_id=m["media_id"],
                url=(
                    storage.presign_get_safe(m["r2_key"])
                    if m["r2_key"]
                    else to_data_uri(m["content_type"] or "image/jpeg", m["image_bytes"])
                    if m["image_bytes"]
                    else None
                ),
                angle=m["capture_angle"],
                is_primary=m["is_primary"],
            )
            for m in media_rows
        ],
        cases=[
            CaseRef(
                case_id=c["case_id"],
                fir_number=c["fir_number"],
                station=c["station"],
                district=c["district"],
                role=c["role"],
                offence=(
                    OffenceRef(
                        ipc_section=c["ipc_section"],
                        bns_section=c["bns_section"],
                        title=c["title"],
                        category=c["category"],
                        severity=c["severity"],
                    )
                    if c["title"]
                    else None
                ),
                registered_on=c["registered_on"],
                status=c["status"],
            )
            for c in case_rows
        ],
        graph_summary=GraphSummary(**graph),
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )
