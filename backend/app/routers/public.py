"""Public read-only endpoints for the Next.js site. No device key.

`/graph/demo` returns a CURATED subgraph, not a live traversal. The public site
must not expose an arbitrary-traversal surface even over synthetic data — the
shape of the API is what an attacker probes, and there is no reason to hand it
over for a marketing page.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.dependencies import get_pool, rate_limit_public
from app.models.graph import (
    GraphResponse,
    PublicReleases,
    PublicStats,
    ReleaseInfo,
)
from app.services import graph_traversal

router = APIRouter(prefix="/v1/public", tags=["public"], dependencies=[Depends(rate_limit_public)])

PLATFORM_NOTE = (
    "Android only. iOS distribution requires a paid Apple Developer account; "
    "see docs/05-MOBILE-APPS.md §6."
)


@router.get("/stats", response_model=PublicStats, summary="Aggregate counts (no PII)")
async def stats(
    settings: Settings = Depends(get_settings), pool: asyncpg.Pool = Depends(get_pool)
) -> PublicStats:
    row = await pool.fetchrow(
        """
        SELECT (SELECT count(*) FROM person)          AS persons,
               (SELECT count(*) FROM case_record)     AS cases,
               (SELECT count(*) FROM face_embedding)  AS embeddings,
               (SELECT count(*) FROM edge)            AS edges,
               (SELECT count(*) FROM search_event)    AS searches,
               (SELECT count(*) FROM search_decision) AS decisions
        """
    )
    return PublicStats(
        persons=row["persons"],
        cases=row["cases"],
        embeddings=row["embeddings"],
        edges=row["edges"],
        searches=row["searches"],
        decisions=row["decisions"],
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.get(
    "/graph/demo",
    response_model=GraphResponse,
    summary="One curated synthetic community for the web explorer",
)
async def graph_demo(
    settings: Settings = Depends(get_settings), pool: asyncpg.Pool = Depends(get_pool)
) -> GraphResponse:
    async with pool.acquire() as conn:
        # Deterministic root: the highest-degree node in the largest community.
        # Fixed input means the public demo looks the same for every visitor.
        root = await conn.fetchval(
            """
            SELECT nm.person_id
            FROM   node_metric nm
            WHERE  nm.community_id = (
                SELECT community_id FROM node_metric
                WHERE  community_id IS NOT NULL
                GROUP  BY community_id ORDER BY count(*) DESC, community_id LIMIT 1
            )
            ORDER  BY nm.degree DESC, nm.person_id
            LIMIT  1
            """
        )
        if root is None:
            return GraphResponse(
                root=UUID(int=0),
                depth=0,
                nodes=[],
                edges=[],
                truncated=False,
                communities=[],
                dataset_mode=settings.dataset_mode,
                server_time=datetime.now(UTC),
            )

        result = await graph_traversal.expand(conn, root, depth=2, min_weight=0.3, limit=40)

    return GraphResponse(
        **result, dataset_mode=settings.dataset_mode, server_time=datetime.now(UTC)
    )


@router.get("/releases", response_model=PublicReleases, summary="Latest APK release metadata")
async def releases(settings: Settings = Depends(get_settings)) -> PublicReleases:
    """Release metadata from environment.

    Deliberately not a live GitHub API call: that would add a network
    dependency (and a rate limit) to a page the site renders on every build.
    The web app queries GitHub directly with ISR instead.
    """
    repo = os.getenv("GITHUB_RELEASES_REPO", "SarmaHighOnCode/Perigee")
    return PublicReleases(
        releases=[
            ReleaseInfo(
                app=app,
                version=os.getenv(f"RELEASE_{app.upper()}_VERSION", "unreleased"),
                apk_url=os.getenv(f"RELEASE_{app.upper()}_APK_URL")
                or f"https://github.com/{repo}/releases/latest",
                sha256=os.getenv(f"RELEASE_{app.upper()}_SHA256"),
                size_bytes=(
                    int(os.environ[f"RELEASE_{app.upper()}_BYTES"])
                    if os.getenv(f"RELEASE_{app.upper()}_BYTES")
                    else None
                ),
                notes=None,
            )
            for app in ("field", "enroll")
        ],
        platform_note=PLATFORM_NOTE,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )
