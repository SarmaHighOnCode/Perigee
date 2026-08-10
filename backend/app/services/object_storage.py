"""S3-compatible object storage (Cloudflare R2) for enrolled mugshots.

Two properties matter more than the API surface:

* Image bytes never transit this service. The client is handed a presigned PUT
  and uploads directly to R2. On a 512 MB instance, proxying uploads is how you
  get OOM-killed mid-demo.
* The bucket is private. Every read is a presigned GET with a short TTL.

PROBE images are never stored here, or anywhere. Only enrolled mugshots.

When R2 is unconfigured the backend runs normally and media endpoints return
503 STORAGE_UNAVAILABLE — development does not require object storage.
"""

from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from typing import Any
from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import Settings
from app.errors import NotFound, StorageUnavailable

log = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png"})


@lru_cache(maxsize=1)
def _client(endpoint: str, key_id: str, secret: str) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


class ObjectStorage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.enabled = settings.storage_enabled

    def _require(self) -> Any:
        if not self.enabled:
            raise StorageUnavailable(
                "Object storage is not configured on this deployment",
                detail={"hint": "set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_BUCKET"},
            )
        return _client(
            self.settings.r2_endpoint,
            self.settings.r2_access_key_id,
            self.settings.r2_secret_access_key,
        )

    @staticmethod
    def build_key(person_id: UUID, media_id: UUID) -> str:
        """Random suffix so a key cannot be guessed from the IDs alone."""
        return f"mugshots/{person_id}/{media_id}-{secrets.token_hex(8)}.jpg"

    def presign_put(self, key: str, content_type: str) -> dict[str, Any]:
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise StorageUnavailable(
                f"content_type {content_type!r} is not permitted",
                detail={"allowed": sorted(ALLOWED_CONTENT_TYPES)},
            )
        client = self._require()
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.settings.r2_bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=self.settings.r2_presign_put_ttl,
        )
        return {
            "upload_url": url,
            "method": "PUT",
            "expires_in": self.settings.r2_presign_put_ttl,
            "max_bytes": self.settings.media_max_bytes,
            "required_headers": {"Content-Type": content_type},
        }

    def presign_get(self, key: str) -> str:
        client = self._require()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.settings.r2_bucket, "Key": key},
            ExpiresIn=self.settings.r2_presign_get_ttl,
        )

    def presign_get_safe(self, key: str | None) -> str | None:
        """Presign, or None. Used on candidate lists, where a missing mugshot
        must not fail the whole search."""
        if not key or not self.enabled:
            return None
        try:
            return self.presign_get(key)
        except ClientError:
            log.warning("presign failed for key", extra={"r2_key_present": True})
            return None

    def head(self, key: str) -> dict[str, Any]:
        """Verify the client actually uploaded, and get the true size.

        Trusting a client-reported byte count would let an app claim a 2 KB
        upload and store 50 MB.
        """
        client = self._require()
        try:
            response = client.head_object(Bucket=self.settings.r2_bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                raise NotFound("Uploaded object not found in storage") from exc
            raise StorageUnavailable("Storage backend error") from exc
        return {
            "bytes": int(response.get("ContentLength", 0)),
            "content_type": response.get("ContentType", ""),
            "etag": (response.get("ETag") or "").strip('"'),
        }

    def delete(self, key: str) -> None:
        client = self._require()
        client.delete_object(Bucket=self.settings.r2_bucket, Key=key)


def get_storage(settings: Settings) -> ObjectStorage:
    return ObjectStorage(settings)
