"""Criminal network graph expansion."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.dependencies import RequestContext, get_pool, rate_limit_read, request_context
from app.errors import MalformedRequest, NotFound
from app.models.graph import GraphResponse
from app.repositories import person as person_repo
from app.services import graph_traversal
from app.services.audit_chain import append as audit_append

router = APIRouter(prefix="/v1", tags=["graph"])


@router.get(
    "/graph/{person_id}",
    response_model=GraphResponse,
    summary="Expand a person's network",
    description=(
        "Bounded breadth-first traversal, hard-capped at depth 3 and 200 nodes. "
        "Every edge carries the case IDs that establish it. Inferred `same_mo` "
        "edges are suppressed unless a documented edge exists for the same pair."
    ),
    dependencies=[Depends(rate_limit_read)],
)
async def expand_graph(
    person_id: UUID,
    depth: int = Query(default=graph_traversal.DEFAULT_DEPTH, ge=1),
    min_weight: float = Query(default=0.0, ge=0.0, le=1.0),
    edge_types: str | None = Query(default=None),
    limit: int = Query(default=graph_traversal.DEFAULT_LIMIT, ge=1),
    ctx: RequestContext = Depends(request_context),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> GraphResponse:
    # Reject an over-deep request rather than silently clamping it: a client
    # asking for depth 5 has a wrong mental model and should be told.
    if depth > graph_traversal.MAX_DEPTH:
        raise MalformedRequest(
            f"depth is capped at {graph_traversal.MAX_DEPTH}",
            detail={"requested": depth, "max_depth": graph_traversal.MAX_DEPTH},
        )
    if limit > graph_traversal.MAX_NODES:
        raise MalformedRequest(
            f"limit is capped at {graph_traversal.MAX_NODES}",
            detail={"requested": limit, "max_nodes": graph_traversal.MAX_NODES},
        )

    types: list[str] | None = None
    if edge_types:
        types = [t.strip() for t in edge_types.split(",") if t.strip()]
        unknown = set(types) - set(graph_traversal.ALL_EDGE_TYPES)
        if unknown:
            raise MalformedRequest(
                f"unknown edge_types: {sorted(unknown)}",
                detail={"allowed": list(graph_traversal.ALL_EDGE_TYPES)},
            )

    async with pool.acquire() as conn:
        if await person_repo.get_person(conn, person_id) is None:
            raise NotFound("Person not found")

        result = await graph_traversal.expand(
            conn,
            person_id,
            depth=depth,
            min_weight=min_weight,
            edge_types=types,
            limit=limit,
        )

        async with conn.transaction():
            await audit_append(
                conn,
                actor_type="officer",
                actor_id=ctx.officer_id,
                device_id=ctx.device.device_id,
                action="graph.expanded",
                subject_type="person",
                subject_id=str(person_id),
                payload={
                    "depth": result["depth"],
                    "node_count": len(result["nodes"]),
                    "truncated": result["truncated"],
                },
            )

    return GraphResponse(
        **result,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )
