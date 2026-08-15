"""Download, verify, and serve the two InsightFace models used by Perigee."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import BinaryIO
from urllib.request import urlopen
from zipfile import BadZipFile, ZipFile


@dataclass(frozen=True)
class Archive:
    url: str
    bytes: int
    sha256: str


@dataclass(frozen=True)
class Model:
    bytes: int
    sha256: str


ARCHIVE = Archive(
    url="https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip",
    bytes=288_621_354,
    sha256="80ffe37d8a5940d59a7384c201a2a38d4741f2f3c51eef46ebb28218a7b0ca2f",
)
MODELS = {
    "det_10g.onnx": Model(
        bytes=16_923_827,
        sha256="5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91",
    ),
    "w600k_r50.onnx": Model(
        bytes=174_383_860,
        sha256="4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43",
    ),
}

CACHE = Path(__file__).resolve().parent / "cache"
LOCAL_URL_BASE = "http://127.0.0.1:8765"
CHUNK_SIZE = 1024 * 1024


class ModelPreparationError(RuntimeError):
    """A downloaded or extracted artifact did not match its pinned manifest."""


def sha256_file(path: Path) -> str:
    """Return the SHA-256 digest of *path*, without loading it all into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_archive(cache: Path) -> Path:
    """Atomically download the pinned release archive into *cache*."""
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / "buffalo_l.zip"
    partial_archive = cache / "buffalo_l.zip.partial"
    if archive.exists():
        validate_archive(archive)
        return archive
    partial_archive.unlink(missing_ok=True)
    try:
        with urlopen(ARCHIVE.url) as response:  # nosec B310: URL is pinned above
            status = getattr(response, "status", response.getcode())
            if status != 200:
                raise ModelPreparationError(f"archive download returned HTTP {status}")
            with partial_archive.open("wb") as destination:
                _copy_stream(response, destination)
        if partial_archive.stat().st_size != ARCHIVE.bytes:
            raise ModelPreparationError(
                f"archive size mismatch: expected {ARCHIVE.bytes}, got {partial_archive.stat().st_size}"
            )
        if sha256_file(partial_archive) != ARCHIVE.sha256:
            raise ModelPreparationError("archive SHA-256 mismatch")
        partial_archive.replace(archive)
        return archive
    except Exception:
        partial_archive.unlink(missing_ok=True)
        raise


def _copy_stream(source: BinaryIO, destination: BinaryIO) -> None:
    for chunk in iter(lambda: source.read(CHUNK_SIZE), b""):
        destination.write(chunk)


def validate_archive(path: Path) -> None:
    """Reject an archive whose length, digest, or ZIP CRC checks do not match."""
    if not path.is_file():
        raise ModelPreparationError(f"archive is missing: {path}")
    if path.stat().st_size != ARCHIVE.bytes:
        raise ModelPreparationError(
            f"archive size mismatch: expected {ARCHIVE.bytes}, got {path.stat().st_size}"
        )
    if sha256_file(path) != ARCHIVE.sha256:
        raise ModelPreparationError("archive SHA-256 mismatch")
    try:
        with ZipFile(path) as zip_file:
            failed_entry = zip_file.testzip()
    except BadZipFile as error:
        raise ModelPreparationError("archive is not a valid ZIP file") from error
    if failed_entry is not None:
        raise ModelPreparationError(f"archive CRC mismatch: {failed_entry}")


def extract_models(archive: Path, output: Path) -> dict[str, Path]:
    """Extract only the pinned models, atomically, after archive validation."""
    validate_archive(archive)
    output.mkdir(parents=True, exist_ok=True)
    extracted: dict[str, Path] = {}
    try:
        with ZipFile(archive) as zip_file:
            for name, expected in MODELS.items():
                try:
                    entry = zip_file.getinfo(name)
                except KeyError as error:
                    raise ModelPreparationError(f"required model missing from archive: {name}") from error
                if entry.file_size != expected.bytes:
                    raise ModelPreparationError(
                        f"{name} size mismatch in archive: expected {expected.bytes}, got {entry.file_size}"
                    )
                destination = output / name
                partial_model = output / f"{name}.partial"
                partial_model.unlink(missing_ok=True)
                try:
                    with zip_file.open(entry) as source, partial_model.open("wb") as target:
                        _copy_stream(source, target)
                    if partial_model.stat().st_size != expected.bytes:
                        raise ModelPreparationError(f"{name} extracted size mismatch")
                    if sha256_file(partial_model) != expected.sha256:
                        raise ModelPreparationError(f"{name} SHA-256 mismatch")
                    partial_model.replace(destination)
                except Exception:
                    partial_model.unlink(missing_ok=True)
                    raise
                extracted[name] = destination
    except BadZipFile as error:
        raise ModelPreparationError("archive is not a valid ZIP file") from error
    return extracted


def write_manifest(models: dict[str, Path], output: Path) -> Path:
    """Write a deterministic manifest for the local model HTTP server."""
    manifest_models = []
    for name in sorted(models):
        path = models[name]
        expected = MODELS[name]
        if path.stat().st_size != expected.bytes or sha256_file(path) != expected.sha256:
            raise ModelPreparationError(f"refusing to manifest unverified model: {name}")
        manifest_models.append(
            {"name": name, "bytes": expected.bytes, "sha256": expected.sha256,
             "url": f"{LOCAL_URL_BASE}/{name}"}
        )
    manifest = output / "manifest.json"
    partial_manifest = output / "manifest.json.partial"
    partial_manifest.write_text(
        json.dumps({"models": manifest_models}, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    partial_manifest.replace(manifest)
    return manifest


class _CorsRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def serve(output: Path, host: str, port: int) -> None:
    """Serve the verified model directory with CORS enabled."""
    if not output.is_dir():
        raise ModelPreparationError(f"model directory is missing: {output}")
    handler = partial(_CorsRequestHandler, directory=str(output))
    server = ThreadingHTTPServer((host, port), handler)
    print(f"Serving {output} at http://{host}:{port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def inspect(output: Path) -> None:
    """Print pinned checks and ONNX input/output metadata for each model."""
    try:
        import onnxruntime as ort
    except ImportError as error:
        raise ModelPreparationError("install testing/face-models/requirements.txt first") from error
    for name, expected in MODELS.items():
        path = output / name
        if not path.is_file():
            raise ModelPreparationError(f"model is missing: {path}")
        actual_bytes = path.stat().st_size
        actual_digest = sha256_file(path)
        if actual_bytes != expected.bytes or actual_digest != expected.sha256:
            raise ModelPreparationError(f"model validation failed: {name}")
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inputs = [(item.name, item.shape, item.type) for item in session.get_inputs()]
        outputs = [(item.name, item.shape, item.type) for item in session.get_outputs()]
        print(f"{name}: bytes={actual_bytes} sha256={actual_digest}")
        print(f"  inputs={inputs}")
        print(f"  outputs={outputs}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("prepare", help="download and verify the pinned models")
    serve_parser = subcommands.add_parser("serve", help="serve verified models over HTTP")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", default=8765, type=int)
    subcommands.add_parser("inspect", help="print hashes, sizes, and ONNX metadata")
    args = parser.parse_args(argv)
    output = CACHE / "models"
    try:
        if args.command == "prepare":
            archive = download_archive(CACHE)
            models = extract_models(archive, output)
            manifest = write_manifest(models, output)
            print(f"Prepared {len(models)} verified models; manifest: {manifest}")
        elif args.command == "serve":
            serve(output, args.host, args.port)
        else:
            inspect(output)
    except (ModelPreparationError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
