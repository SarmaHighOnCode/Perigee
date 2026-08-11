#!/usr/bin/env python3
"""Build or check the deterministic synthetic face-fixture manifest."""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import os
import stat
import struct
import sys
from pathlib import Path


FIXTURE_ROOT = Path(__file__).resolve().parents[1]
IMAGES_ROOT = FIXTURE_ROOT / "images"
MANIFEST_PATH = FIXTURE_ROOT / "manifest.json"
POSITIVE_IDENTITIES = tuple(f"synth-{index:02d}" for index in range(1, 6))
ENROLLMENT_POSES = (
    "frontal-1",
    "frontal-2",
    "left-1",
    "left-2",
    "right-1",
    "right-2",
)
PROBE_POSES = ("probe-1", "probe-2", "probe-3")
CONTROLS = ("no-face", "two-faces", "blurred-face", "dark-face")


def is_reparse_point(path: Path) -> bool:
    """Return whether path is a symlink, junction, or other reparse point."""
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode):
        return True
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    if getattr(metadata, "st_file_attributes", 0) & reparse_flag:
        return True
    is_junction = getattr(path, "is_junction", None)
    return bool(is_junction and is_junction())


def ensure_contained(path: Path, root: Path) -> None:
    """Reject lexical entries that resolve outside the fixture image root."""
    try:
        path.resolve(strict=True).relative_to(root)
    except ValueError as error:
        raise ValueError(f"fixture path resolves outside images root: {path}") from error


def enumerate_image_tree() -> tuple[set[Path], set[Path]]:
    """Enumerate every entry without following reparse points."""
    if not IMAGES_ROOT.is_dir():
        raise ValueError(f"missing fixture images directory: {IMAGES_ROOT}")
    if is_reparse_point(IMAGES_ROOT):
        raise ValueError(f"fixture images root is a symlink or reparse point: {IMAGES_ROOT}")

    root = IMAGES_ROOT.resolve(strict=True)
    files: set[Path] = set()
    directories: set[Path] = set()

    def visit(directory: Path) -> None:
        with os.scandir(directory) as entries:
            for entry in sorted(entries, key=lambda item: item.name):
                path = Path(entry.path)
                relative = path.relative_to(IMAGES_ROOT)
                if is_reparse_point(path):
                    raise ValueError(f"fixture contains a symlink or reparse point: {relative}")
                metadata = path.lstat()
                ensure_contained(path, root)
                if stat.S_ISDIR(metadata.st_mode):
                    directories.add(relative)
                    visit(path)
                elif stat.S_ISREG(metadata.st_mode):
                    files.add(relative)
                else:
                    raise ValueError(f"fixture contains an unsupported filesystem entry: {relative}")

    visit(IMAGES_ROOT)
    return files, directories


def read_png_size(path: Path) -> tuple[int, int]:
    """Validate PNG chunk framing/CRCs and return IHDR dimensions."""
    with path.open("rb") as image:
        if image.read(8) != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"not a PNG: {path}")

        width = height = None
        saw_iend = False
        chunk_index = 0
        while not saw_iend:
            header = image.read(8)
            if len(header) != 8:
                raise ValueError(f"truncated PNG chunk header: {path}")
            length, chunk_type = struct.unpack(">I4s", header)
            payload = image.read(length)
            crc_bytes = image.read(4)
            if len(payload) != length or len(crc_bytes) != 4:
                raise ValueError(f"truncated PNG chunk: {path}")
            expected_crc = struct.unpack(">I", crc_bytes)[0]
            actual_crc = binascii.crc32(chunk_type + payload) & 0xFFFFFFFF
            if actual_crc != expected_crc:
                raise ValueError(f"invalid PNG chunk CRC: {path}")

            if chunk_index == 0:
                if chunk_type != b"IHDR" or length != 13:
                    raise ValueError(f"missing PNG IHDR: {path}")
                width, height = struct.unpack(">II", payload[:8])
            if chunk_type == b"IEND":
                if length != 0:
                    raise ValueError(f"invalid PNG IEND: {path}")
                saw_iend = True
            chunk_index += 1

    if not width or not height:
        raise ValueError(f"invalid PNG dimensions: {path}")
    return width, height


def expected_inventory() -> list[tuple[Path, str | None, str, str]]:
    inventory: list[tuple[Path, str | None, str, str]] = []
    for identity in POSITIVE_IDENTITIES:
        inventory.extend(
            (Path(identity) / f"enrollment-{pose}.png", identity, "enrollment", pose)
            for pose in ENROLLMENT_POSES
        )
        inventory.extend(
            (Path(identity) / f"probe-{pose}.png", identity, "probe", pose)
            for pose in PROBE_POSES
        )
    inventory.extend(
        (Path("synth-06") / f"probe-{pose}.png", "synth-06", "probe", pose)
        for pose in PROBE_POSES
    )
    inventory.extend(
        (Path("controls") / f"{control}.png", None, "control", control)
        for control in CONTROLS
    )
    return sorted(inventory, key=lambda item: item[0].as_posix())


def build_manifest() -> dict[str, object]:
    inventory = expected_inventory()
    expected_paths = {relative for relative, *_ in inventory}
    expected_directories = {
        parent
        for relative in expected_paths
        for parent in relative.parents
        if parent != Path(".")
    }
    actual_paths, actual_directories = enumerate_image_tree()
    missing = sorted(expected_paths - actual_paths)
    unexpected = sorted(actual_paths - expected_paths)
    missing_directories = sorted(expected_directories - actual_directories)
    unexpected_directories = sorted(actual_directories - expected_directories)
    if missing or unexpected or missing_directories or unexpected_directories:
        raise ValueError(
            "fixture inventory mismatch: "
            f"missing={missing}, unexpected={unexpected}, "
            f"missing_directories={missing_directories}, "
            f"unexpected_directories={unexpected_directories}"
        )

    entries: list[dict[str, object]] = []
    hashes: set[str] = set()
    for relative, identity, use, pose in inventory:
        image_path = IMAGES_ROOT / relative
        width, height = read_png_size(image_path)
        if width < 512 or height < 512:
            raise ValueError(f"image below 512x512: {image_path} ({width}x{height})")
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
        if digest in hashes:
            raise ValueError(f"duplicate image content: {image_path}")
        hashes.add(digest)
        entries.append(
            {
                "height": height,
                "identity": identity,
                "path": (Path("images") / relative).as_posix(),
                "pose": pose,
                "sha256": digest,
                "synthetic": True,
                "use": use,
                "width": width,
            }
        )
    return {"entries": entries, "schema_version": 1}


def render_manifest(manifest: dict[str, object]) -> str:
    return json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if manifest.json differs from the deterministic generated form",
    )
    args = parser.parse_args()

    try:
        rendered = render_manifest(build_manifest())
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    if args.check:
        try:
            current = MANIFEST_PATH.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"missing manifest: {MANIFEST_PATH}", file=sys.stderr)
            return 1
        if current != rendered:
            print("manifest.json is stale; run validate_manifest.py", file=sys.stderr)
            return 1
        print(f"validated {len(build_manifest()['entries'])} synthetic face fixtures")
        return 0

    MANIFEST_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"wrote {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
