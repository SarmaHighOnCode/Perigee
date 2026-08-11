"""Probe embedding validation.

The norm check is the important one. A wrong-length vector fails loudly
anyway; an UN-NORMALISED vector does not error at all — it silently corrupts
cosine ranking and returns the wrong people with confident-looking scores.
"""

from __future__ import annotations

import math

import pytest

from app.errors import InvalidEmbedding, QualityBelowFloor, UnsupportedModel
from app.services.embedding import l2_norm, validate_embedding
from tests.conftest import MODEL_ID, unit_vector


def test_accepts_a_valid_probe(settings):
    validate_embedding(unit_vector(1), MODEL_ID, 0.9, settings)


@pytest.mark.parametrize("dim", [0, 1, 511, 513, 1024])
def test_rejects_wrong_dimension(settings, dim):
    with pytest.raises(InvalidEmbedding) as exc:
        validate_embedding(unit_vector(2, dim) if dim else [], MODEL_ID, 0.9, settings)
    assert exc.value.code == "INVALID_EMBEDDING"
    assert exc.value.detail["expected_dim"] == 512


def test_rejects_nan():
    from app.config import Settings

    settings = Settings(dataset_mode="synthetic", allowed_model_ids=MODEL_ID)
    vector = unit_vector(3)
    vector[17] = math.nan
    with pytest.raises(InvalidEmbedding, match="NaN"):
        validate_embedding(vector, MODEL_ID, 0.9, settings)


def test_rejects_infinity(settings):
    vector = unit_vector(4)
    vector[3] = math.inf
    with pytest.raises(InvalidEmbedding):
        validate_embedding(vector, MODEL_ID, 0.9, settings)


@pytest.mark.parametrize("scale", [0.5, 0.9, 1.1, 2.0, 10.0])
def test_rejects_unnormalised(settings, scale):
    """The silent-corruption case: scaling a valid vector keeps every value
    finite and the length correct, but destroys the cosine ranking."""
    scaled = [v * scale for v in unit_vector(5)]
    with pytest.raises(InvalidEmbedding, match="L2-normalised"):
        validate_embedding(scaled, MODEL_ID, 0.9, settings)


def test_accepts_norm_within_tolerance(settings):
    """Float32 round-tripping on-device will not produce exactly 1.0."""
    for scale in (0.995, 1.0, 1.005):
        vector = [v * scale for v in unit_vector(6)]
        validate_embedding(vector, MODEL_ID, 0.9, settings)


def test_rejects_zero_vector(settings):
    with pytest.raises(InvalidEmbedding):
        validate_embedding([0.0] * 512, MODEL_ID, 0.9, settings)


def test_rejects_unknown_model(settings):
    """Vectors from a different model are not comparable. Rejecting is the
    whole point: a silent search would return plausible wrong people."""
    with pytest.raises(UnsupportedModel) as exc:
        validate_embedding(unit_vector(7), "insightface/w600k_mbf@1", 0.9, settings)
    assert MODEL_ID in exc.value.detail["allowed_model_ids"]


def test_rejects_quality_below_floor(settings):
    with pytest.raises(QualityBelowFloor) as exc:
        validate_embedding(unit_vector(8), MODEL_ID, 0.10, settings)
    assert exc.value.detail["floor"] == settings.quality_floor


def test_validation_order_dimension_before_model(settings):
    """A 511-d vector from an unknown model reports the dimension problem —
    the client should be told the first thing that is wrong, not the last."""
    with pytest.raises(InvalidEmbedding):
        validate_embedding(unit_vector(9, 511), "unknown/model@1", 0.9, settings)


def test_l2_norm():
    assert l2_norm([3.0, 4.0]) == pytest.approx(5.0)
    assert l2_norm(unit_vector(10)) == pytest.approx(1.0, abs=1e-9)
