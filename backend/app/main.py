"""Perigee Core — application entrypoint.

Stateless. No ML dependencies. Face embedding runs on-device and this service
receives a 512-float vector; see docs/ADR/0001-on-device-embedding.md.
"""

from __future__ import annotations

import logging
import sys
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from pythonjsonlogger.json import JsonFormatter

from app.config import get_settings, validate_for_runtime
from app.db import apply_migrations, create_pool, sync_system_config
from app.errors import (
    PerigeeError,
    perigee_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.routers import audit, config, graph, health, person, public, search
from app.services.rate_limit import Limiters

log = logging.getLogger("perigee")


def configure_logging(level: str) -> None:
    """Structured JSON from day one.

    Every line carries request_id and route. NEVER an embedding, a name, or an
    object key — a log that accumulates the data it monitors is a second breach
    surface.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)

    problems = validate_for_runtime(settings)
    if problems:
        for problem in problems:
            log.error("configuration error: %s", problem)
        raise RuntimeError(f"invalid configuration: {'; '.join(problems)}")

    app.state.limiters = Limiters(settings)
    app.state.pool = None

    if settings.database_url:
        app.state.pool = await create_pool(settings)
        applied = await apply_migrations(app.state.pool)
        if applied:
            log.info("applied migrations", extra={"versions": applied})
        # Keep the DB trigger's limit in step with the configured one.
        await sync_system_config(app.state.pool, settings)
    else:
        # Allows contract/unit tests to import the app without a database.
        log.warning("DATABASE_URL is not set; database-backed routes will fail")

    log.info(
        "perigee-core started",
        extra={"dataset_mode": settings.dataset_mode, "app_env": settings.app_env},
    )
    try:
        yield
    finally:
        if app.state.pool is not None:
            await app.state.pool.close()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Perigee Core",
        version="0.1.0",
        description=(
            "Field identity-screening API.\n\n"
            "**This API never returns a match.** It returns ranked candidates with "
            "similarity scores. A search opens in `PENDING_DECISION` and does not "
            "close until a human records a decision. Full PII requires a confirmed "
            "identification.\n\n"
            "Synthetic data only. Every response carries `dataset_mode`."
        ),
        lifespan=lifespan,
        openapi_url="/openapi.json",
        docs_url="/docs",
    )

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get(settings.request_id_header) or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[settings.request_id_header] = request_id
        return response

    app.add_exception_handler(PerigeeError, perigee_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(ValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(health.router)
    app.include_router(config.router)
    app.include_router(search.router)
    app.include_router(person.router)
    app.include_router(graph.router)
    app.include_router(audit.router)
    app.include_router(public.router)

    return app


app = create_app()
