"""Runtime configuration. Fails fast and loudly on anything missing."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    app_env: Literal["development", "test", "production"] = "development"

    # No default. A deployment that forgets this flag must not start, because
    # `synthetic` is the guarantee that nobody mistakes this for a live system.
    dataset_mode: Literal["synthetic", "real"]

    database_url: str = ""
    db_pool_min: int = 1
    db_pool_max: int = 5

    device_key_pepper: str = ""

    # Vectors from different models are not comparable. Anything not on this
    # list is rejected 422, never silently searched.
    allowed_model_ids: str = "insightface/w600k_r50@1"

    quality_floor: float = 0.35
    band_no_match: float = 0.28
    band_weak: float = 0.42
    band_review: float = 0.58
    ambiguity_gap: float = 0.05

    search_top_k_default: int = 5
    search_top_k_min: int = 3
    search_top_k_max: int = 10
    search_pending_limit: int = 3
    search_expiry_minutes: int = 30

    # Off by default: retaining probe embeddings would build a movement history
    # of people who were never charged with anything.
    retain_probe_embedding: bool = False

    r2_endpoint: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_public_base_url: str = ""
    r2_presign_get_ttl: int = 120
    r2_presign_put_ttl: int = 300
    media_max_bytes: int = 2 * 1024 * 1024

    cors_origins: str = ""
    log_level: str = "INFO"

    embedding_dim: int = 512
    embedding_norm_tolerance: float = 0.01

    request_id_header: str = "X-Request-Id"
    device_key_header: str = "X-Perigee-Device-Key"
    officer_id_header: str = "X-Perigee-Officer-Id"

    rate_limit_search_per_min: int = 20
    rate_limit_write_per_min: int = 30
    rate_limit_read_per_min: int = 120
    rate_limit_public_per_min: int = 30
    # "memory" is correct only for a single-process deployment. Any host that
    # runs several instances MUST use "postgres", or each instance keeps its
    # own counter and the configured limit is multiplied by the instance count.
    rate_limit_backend: Literal["memory", "postgres"] = "memory"

    @field_validator("allowed_model_ids", "cors_origins")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _check_bands(self) -> Settings:
        if not (0 <= self.band_no_match < self.band_weak < self.band_review <= 1):
            raise ValueError(
                "score bands must satisfy 0 <= band_no_match < band_weak < band_review <= 1"
            )
        if self.search_top_k_min > self.search_top_k_default:
            raise ValueError("search_top_k_min cannot exceed search_top_k_default")
        return self

    @property
    def model_ids(self) -> tuple[str, ...]:
        return tuple(m.strip() for m in self.allowed_model_ids.split(",") if m.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def storage_enabled(self) -> bool:
        """R2 is optional in development; media endpoints 503 without it."""
        return bool(self.r2_endpoint and self.r2_access_key_id and self.r2_bucket)

    @property
    def band_config(self) -> dict[str, float]:
        """Frozen into every search_event so past decisions stay auditable."""
        return {
            "no_match": self.band_no_match,
            "weak": self.band_weak,
            "review": self.band_review,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


# Fields whose absence should stop a production boot rather than degrade it.
REQUIRED_IN_PRODUCTION = ("database_url", "device_key_pepper")


def validate_for_runtime(settings: Settings) -> list[str]:
    """Return human-readable problems that should block startup."""
    problems: list[str] = []
    if settings.app_env == "production":
        for field in REQUIRED_IN_PRODUCTION:
            if not getattr(settings, field):
                problems.append(f"{field.upper()} must be set in production")
        if settings.dataset_mode == "real":
            problems.append(
                "DATASET_MODE=real is not permitted by this build; "
                "see docs/09-COMPLIANCE-INDIA.md §6 for the prerequisites"
            )
    if not settings.model_ids:
        problems.append("ALLOWED_MODEL_IDS must list at least one model")
    return problems
