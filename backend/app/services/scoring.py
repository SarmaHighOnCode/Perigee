"""Score bands, ambiguity, and candidate-set assembly.

The word MATCH never appears as a system assertion — only CANDIDATE. Automation
bias is driven by the language a system uses about its own confidence, and
"STRONG CANDIDATE" versus "MATCH FOUND" produces measurably different officer
behaviour on identical data.

Contract: docs/04-FACE-PIPELINE.md §5.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.config import Settings

Band = Literal["NO_MATCH", "WEAK", "REVIEW", "STRONG"]

ADVISORY = "HUMAN VERIFICATION REQUIRED. This system does not identify persons."


@dataclass(frozen=True)
class ScoredCandidate:
    person_id: str
    embedding_id: str
    similarity: float
    band: Band


def band_for(similarity: float, settings: Settings) -> Band:
    if similarity < settings.band_no_match:
        return "NO_MATCH"
    if similarity < settings.band_weak:
        return "WEAK"
    if similarity < settings.band_review:
        return "REVIEW"
    return "STRONG"


def score_gap(similarities: list[float]) -> float | None:
    """Rank-1 minus rank-2.

    A small gap is the classic misidentification setup — often siblings, or
    simply two people the model cannot separate.
    """
    if len(similarities) < 2:
        return None
    return round(similarities[0] - similarities[1], 6)


def is_ambiguous(gap: float | None, settings: Settings) -> bool:
    return gap is not None and gap < settings.ambiguity_gap


def assemble_candidates(
    ranked: list[tuple[str, str, float]],
    top_k: int,
    settings: Settings,
) -> list[ScoredCandidate]:
    """Turn (person_id, embedding_id, similarity) rows into the returned set.

    Two rules that pull against each other, resolved explicitly:

    1. A genuine no-match returns ZERO candidates. If even the best score is
       below `band_no_match`, everything on offer is noise, and rendering noise
       invites an officer to pattern-match against it. This is the outcome the
       product is built around: the person walks.

    2. Otherwise return AT LEAST `search_top_k_min` (3). A single result invites
       a yes/no reflex; three faces force a comparison. Padding entries may fall
       below the band, and they are labelled with their true band so a weak
       filler can never read as a contender.

    docs/03-API-SPEC.md described these separately and did not say which wins
    when they collide. See docs/CONTRACT-NOTES.md #1.
    """
    if not ranked:
        return []

    if ranked[0][2] < settings.band_no_match:
        return []

    keep = [r for r in ranked if r[2] >= settings.band_no_match]

    if len(keep) < settings.search_top_k_min:
        seen = {(r[0]) for r in keep}
        for row in ranked:
            if len(keep) >= settings.search_top_k_min:
                break
            if row[0] not in seen:
                keep.append(row)
                seen.add(row[0])

    keep = keep[: max(top_k, settings.search_top_k_min)]

    return [
        ScoredCandidate(
            person_id=str(person_id),
            embedding_id=str(embedding_id),
            similarity=round(float(similarity), 6),
            band=band_for(similarity, settings),
        )
        for person_id, embedding_id, similarity in keep
    ]


def clamp_top_k(requested: int | None, settings: Settings) -> int:
    if requested is None:
        return settings.search_top_k_default
    return max(settings.search_top_k_min, min(requested, settings.search_top_k_max))
