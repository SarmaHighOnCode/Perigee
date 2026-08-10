"""SQL construction for the vector search.

`model_id` is inlined into the SQL rather than parameterised, because Postgres
will not use a partial index whose predicate it cannot prove — and it cannot
prove anything about a parameter's value at plan time.

Inlining anything into SQL deserves a test that says why it is safe.
"""

from __future__ import annotations

import pytest

from app.services.vector_search import UnsafeModelIdError, _search_sql
from tests.conftest import MODEL_ID


def test_model_id_is_inlined_as_a_literal():
    """A literal predicate is what lets the planner match the partial index."""
    sql = _search_sql(MODEL_ID)
    assert f"model_id = '{MODEL_ID}'" in sql
    assert "model_id = $" not in sql, "a parameterised predicate cannot match the partial index"


def test_index_expression_is_preserved_exactly():
    """If this ORDER BY drifts from the index expression, the index becomes
    unusable and Postgres degrades to a sort without erroring."""
    sql = _search_sql(MODEL_ID)
    assert "ORDER  BY embedding::halfvec(512) <=> $1::text::halfvec(512)" in sql


def test_distance_is_reported_at_full_precision():
    """Ranking comes from halfvec (cheap); the reported score is full float32."""
    sql = _search_sql(MODEL_ID)
    assert "embedding <=> $1::text::vector(512) AS distance" in sql


def test_deduplicates_by_person():
    sql = _search_sql(MODEL_ID)
    assert "DISTINCT ON (person_id)" in sql


@pytest.mark.parametrize(
    "hostile",
    [
        "model'; DROP TABLE person; --",
        "model' OR '1'='1",
        'model"quote',
        "model\\backslash",
        "model with spaces",
        "model\nnewline",
        "model\x00null",
        "",
        "x" * 200,
    ],
)
def test_rejects_anything_unsafe_to_inline(hostile):
    """Defence in depth. Callers already check model_id against the config
    allowlist, so none of these can reach here — which is exactly why this
    guard must be tested directly rather than trusted."""
    with pytest.raises(UnsafeModelIdError):
        _search_sql(hostile)


def test_permits_realistic_model_identifiers():
    for ok in (
        "insightface/w600k_r50@1",
        "insightface/w600k_mbf@2",
        "vendor.model-name_v1",
        "org/model@2026-01-01",
    ):
        assert f"'{ok}'" in _search_sql(ok)


def test_sql_is_cached_per_model():
    """Formatting happens a handful of times per process, never per request."""
    assert _search_sql(MODEL_ID) is _search_sql(MODEL_ID)
