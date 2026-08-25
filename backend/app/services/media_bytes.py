"""Inline (Postgres-backed) media, for a deployment with no R2 credentials.

Embedding the image as a data: URI directly in the JSON response means every
client that already renders `media.url` / `mugshot_url` needs zero changes:
a data URI is exactly as usable by an <Image source={{ uri }}> as a presigned
R2 URL is, and unlike an R2 URL it needs no separate authenticated fetch.
"""

from __future__ import annotations

import base64


def to_data_uri(content_type: str, image_bytes: bytes) -> str:
    return f"data:{content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
