"""Score bands, ambiguity, and candidate-set assembly."""

from __future__ import annotations

import pytest

from app.services.scoring import (
    assemble_candidates,
    band_for,
    clamp_top_k,
    is_ambiguous,
    score_gap,
)


@pytest.mark.parametrize(
    ("similarity", "expected"),
    [
        (0.00, "NO_MATCH"),
        (0.27, "NO_MATCH"),
        (0.28, "WEAK"),
        (0.41, "WEAK"),
        (0.42, "REVIEW"),
        (0.57, "REVIEW"),
        (0.58, "STRONG"),
        (0.99, "STRONG"),
    ],
)
def test_band_boundaries(settings, similarity, expected):
    assert band_for(similarity, settings) == expected


def test_score_gap():
    assert score_gap([0.64, 0.59]) == pytest.approx(0.05)
    assert score_gap([0.9]) is None
    assert score_gap([]) is None


def test_ambiguity(settings):
    assert is_ambiguous(0.02, settings) is True
    assert is_ambiguous(0.05, settings) is False
    assert is_ambiguous(None, settings) is False


def _rows(*sims: float) -> list[tuple[str, str, float]]:
    return [(f"person-{i}", f"emb-{i}", s) for i, s in enumerate(sims)]


def test_genuine_no_match_returns_zero_candidates(settings):
    """The release outcome. Everything below the floor is noise, and rendering
    noise invites an officer to pattern-match against it."""
    assert assemble_candidates(_rows(0.21, 0.19, 0.15), 5, settings) == []


def test_empty_input(settings):
    assert assemble_candidates([], 5, settings) == []


def test_pads_to_minimum_three(settings):
    """A single result invites a yes/no reflex; three faces force a comparison."""
    out = assemble_candidates(_rows(0.71, 0.20, 0.18, 0.17), 5, settings)
    assert len(out) == 3
    assert out[0].band == "STRONG"
    # Padding entries keep their TRUE band, so filler can never read as a
    # contender.
    assert out[1].band == "NO_MATCH"


def test_does_not_pad_when_corpus_is_small(settings):
    out = assemble_candidates(_rows(0.71), 5, settings)
    assert len(out) == 1


def test_respects_top_k(settings):
    out = assemble_candidates(_rows(*[0.9 - i * 0.01 for i in range(10)]), 5, settings)
    assert len(out) == 5


def test_top_k_never_below_minimum(settings):
    out = assemble_candidates(_rows(0.9, 0.85, 0.8, 0.75), 1, settings)
    assert len(out) >= settings.search_top_k_min


def test_ranks_are_ordered_and_scores_rounded(settings):
    out = assemble_candidates(_rows(0.9123456789, 0.8, 0.7), 3, settings)
    assert [c.similarity for c in out] == sorted([c.similarity for c in out], reverse=True)
    assert out[0].similarity == pytest.approx(0.912346, abs=1e-6)


def test_padding_does_not_duplicate_a_person(settings):
    rows = [("p1", "e1", 0.71), ("p1", "e2", 0.20), ("p2", "e3", 0.19)]
    out = assemble_candidates(rows, 5, settings)
    assert len({c.person_id for c in out}) == len(out)


@pytest.mark.parametrize(("requested", "expected"), [(None, 5), (1, 3), (3, 3), (7, 7), (99, 10)])
def test_clamp_top_k(settings, requested, expected):
    assert clamp_top_k(requested, settings) == expected
