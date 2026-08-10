"""Probe embedding validation.

Pure functions, no numpy — the runtime has no scientific stack and does not
need one for a dot product over 512 floats.

Validation order matters: each failure is specific so the client can tell the
officer what to do, rather than showing a generic 422.

Contract: docs/03-API-SPEC.md §2.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from app.config import Settings
from app.errors import InvalidEmbedding, QualityBelowFloor, UnsupportedModel


def l2_norm(vector: Sequence[float]) -> float:
    return math.sqrt(sum(float(v) * float(v) for v in vector))


def validate_embedding(
    vector: Sequence[float],
    model_id: str,
    quality_score: float,
    settings: Settings,
) -> None:
    """Raise a specific PerigeeError, or return None.

    An un-normalised vector is the dangerous case: cosine ranking against it
    does not error, it silently returns the wrong people. Hence the norm check.
    """
    dim = settings.embedding_dim

    if len(vector) != dim:
        raise InvalidEmbedding(
            f"embedding must have exactly {dim} dimensions, got {len(vector)}",
            detail={"expected_dim": dim, "received_dim": len(vector)},
        )

    for i, value in enumerate(vector):
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            raise InvalidEmbedding(
                "embedding contains NaN or infinity",
                detail={"index": i},
            )

    norm = l2_norm(vector)
    tol = settings.embedding_norm_tolerance
    if not (1.0 - tol <= norm <= 1.0 + tol):
        raise InvalidEmbedding(
            f"embedding must be L2-normalised; ||v|| = {norm:.6f}, expected 1.0 +/- {tol}",
            detail={"norm": round(norm, 6), "tolerance": tol},
        )

    if model_id not in settings.model_ids:
        raise UnsupportedModel(
            f"model_id {model_id!r} is not accepted by this deployment",
            detail={"allowed_model_ids": list(settings.model_ids)},
        )

    if quality_score < settings.quality_floor:
        raise QualityBelowFloor(
            f"probe quality {quality_score:.2f} is below the floor "
            f"{settings.quality_floor:.2f}",
            detail={"quality": quality_score, "floor": settings.quality_floor},
        )
