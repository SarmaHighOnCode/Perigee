"""Vercel Python entrypoint.

Vercel discovers an ASGI app named `app` in this module and serves it. The
application itself is unchanged — this file only puts the repository's `backend`
directory on the import path, because Vercel runs the function from the project
root rather than from `backend/`.

WHY THIS EXISTS ALONGSIDE render.yaml
Render is the designed target (docs/ADR/0004-render-native-python.md): one
process, one bucket store, a long-lived asyncpg pool. Vercel runs an
unpredictable number of instances instead, so a deployment here is only correct
with RATE_LIMIT_BACKEND=postgres — otherwise each instance keeps its own
counters and every rate limit is silently multiplied by the instance count.
`app.main` raises at startup if that variable is not set correctly, so this
cannot be got wrong quietly.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app

__all__ = ["app"]
