"""Contract guarantees enforced against the live OpenAPI schema.

These are the tests that protect the product's central claim. Everything else
can be refactored; if one of these fails, the system has started asserting
identifications, and that is not a refactor — it is a different product.
"""

from __future__ import annotations

import json

import pytest

# Any of these appearing in a response schema would mean the machine had begun
# answering a question only a human is permitted to answer.
FORBIDDEN_FIELDS = {
    "is_match",
    "matched",
    "is_matched",
    "identity_confirmed",
    "identified",
    "match_found",
    "positive_match",
}


@pytest.fixture
def openapi(app_client) -> dict:
    response = app_client.get("/openapi.json")
    assert response.status_code == 200
    return response.json()


def _walk(node, path="") -> list[tuple[str, str]]:
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "properties" and isinstance(value, dict):
                for prop in value:
                    if prop.lower() in FORBIDDEN_FIELDS:
                        found.append((path, prop))
            found.extend(_walk(value, f"{path}.{key}"))
    elif isinstance(node, list):
        for i, item in enumerate(node):
            found.extend(_walk(item, f"{path}[{i}]"))
    return found


def test_no_match_assertion_field_anywhere_in_schema(openapi):
    offenders = _walk(openapi)
    assert not offenders, (
        f"forbidden match-assertion field(s) in the API schema: {offenders}. "
        "This API returns ranked CANDIDATES with scores. It must never assert "
        "an identification. See docs/03-API-SPEC.md §10."
    )


def test_no_match_assertion_token_in_serialised_schema(openapi):
    """Belt and braces: catches a field added somewhere the walker misses."""
    blob = json.dumps(openapi).lower()
    for field in FORBIDDEN_FIELDS:
        assert f'"{field}"' not in blob, f"{field!r} appears in the OpenAPI document"


def test_search_response_exposes_candidates_and_bands(openapi):
    schema = openapi["components"]["schemas"]["SearchResponse"]["properties"]
    for required in (
        "search_id",
        "candidates",
        "score_gap",
        "ambiguous",
        "threshold_in_effect",
        "bands",
        "advisory",
        "dataset_mode",
    ):
        assert required in schema, f"SearchResponse must expose {required}"


def test_search_opens_pending_by_construction(openapi):
    """status is a single-valued enum: a search cannot be born closed."""
    status = openapi["components"]["schemas"]["SearchResponse"]["properties"]["status"]
    assert status.get("const") == "PENDING_DECISION" or status.get("enum") == ["PENDING_DECISION"]


def test_candidate_exposes_masked_name_not_full_name(openapi):
    """Four of five candidates are innocent and must not be identified."""
    props = openapi["components"]["schemas"]["Candidate"]["properties"]
    assert "masked_name" in props
    assert "full_name" not in props


def test_decision_is_required_to_close_a_search(openapi):
    assert "/v1/search/{search_id}/decision" in openapi["paths"]
    decision = openapi["components"]["schemas"]["DecisionRequest"]["properties"]["decision"]
    ref = decision.get("enum") or decision.get("const")
    assert ref is None or set(ref) <= {"CONFIRMED", "NO_MATCH", "INCONCLUSIVE", "ABORTED"}


def test_no_bulk_or_batch_search_endpoint(openapi):
    """Batch face search over a crowd is a different system with a different
    legal basis. Its absence is deliberate — see docs/03-API-SPEC.md §10."""
    for path in openapi["paths"]:
        assert "batch" not in path.lower(), f"batch endpoint present: {path}"
        assert path != "/v1/search/all"


def test_no_person_search_by_name(openapi):
    """Face in, candidates out. Not a PII search engine."""
    person_get = openapi["paths"].get("/v1/person/{person_id}", {}).get("get", {})
    params = {p.get("name") for p in person_get.get("parameters", [])}
    assert "name" not in params
    assert "full_name" not in params
    assert "search_id" in params, "purpose binding requires a search_id parameter"


def test_no_audit_delete_endpoint(openapi):
    for path, methods in openapi["paths"].items():
        if path.startswith("/v1/audit"):
            assert "delete" not in methods, f"audit must be append-only: {path}"


def test_healthz_and_config_are_documented(openapi):
    for path in ("/healthz", "/readyz", "/v1/config"):
        assert path in openapi["paths"]


def test_healthz_reports_dataset_mode(app_client):
    body = app_client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["dataset_mode"] == "synthetic"


def test_config_serves_bands_so_clients_never_hardcode_them(app_client):
    body = app_client.get("/v1/config").json()
    assert set(body["bands"]) == {"no_match", "weak", "review"}
    assert body["dataset_mode"] == "synthetic"
    assert body["advisory"].startswith("HUMAN VERIFICATION REQUIRED")
    assert body["pending_decision_limit"] >= 1


def test_error_envelope_shape(app_client):
    """Every error uses one shape; clients switch on error.code."""
    response = app_client.post("/v1/search", json={"nonsense": True})
    assert response.status_code in (401, 422)
    body = response.json()
    assert set(body["error"]) == {"code", "message", "detail", "request_id"}


def test_device_key_is_required(app_client):
    response = app_client.post(
        "/v1/search",
        json={
            "embedding": [0.0] * 512,
            "model_id": "insightface/w600k_r50@1",
            "quality": {"score": 0.9},
            "reason_code": "training",
        },
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "DEVICE_KEY_MISSING"


def test_request_id_is_echoed(app_client):
    response = app_client.get("/healthz", headers={"X-Request-Id": "test-req-1"})
    assert response.headers["X-Request-Id"] == "test-req-1"
