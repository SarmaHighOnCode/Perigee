import hashlib
import importlib.util
import json
import os
import re
import struct
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

FIXTURE_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = FIXTURE_ROOT / "manifest.json"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
POSITIVE_IDENTITIES = tuple(f"synth-{index:02d}" for index in range(1, 6))
NEGATIVE_IDENTITY = "synth-06"
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
VALIDATOR_PATH = FIXTURE_ROOT / "scripts" / "validate_manifest.py"


@pytest.fixture
def validator_module():
    spec = importlib.util.spec_from_file_location("face_fixture_validator", VALIDATOR_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def minimal_validator_tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, validator_module):
    images_root = tmp_path / "images"
    expected_relative = Path("synth-01/enrollment-frontal-1.png")
    expected_path = images_root / expected_relative
    expected_path.parent.mkdir(parents=True)
    expected_path.write_bytes(b"synthetic fixture bytes")
    monkeypatch.setattr(validator_module, "IMAGES_ROOT", images_root)
    monkeypatch.setattr(
        validator_module,
        "expected_inventory",
        lambda: [(expected_relative, "synth-01", "enrollment", "frontal-1")],
    )
    monkeypatch.setattr(validator_module, "read_png_size", lambda _: (512, 512))
    return images_root, expected_path


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as image:
        assert image.read(8) == b"\x89PNG\r\n\x1a\n"
        length, chunk_type = struct.unpack(">I4s", image.read(8))
        assert length == 13 and chunk_type == b"IHDR"
        return struct.unpack(">II", image.read(8))


def load_entries() -> list[dict]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["entries"]


def test_manifest_inventory_is_exact() -> None:
    entries = load_entries()
    assert len(entries) == 52
    actual = Counter(
        (entry["path"], entry["identity"], entry["use"], entry["pose"])
        for entry in entries
    )
    expected = Counter()
    for identity in POSITIVE_IDENTITIES:
        expected.update(
            (f"images/{identity}/enrollment-{pose}.png", identity, "enrollment", pose)
            for pose in ENROLLMENT_POSES
        )
        expected.update(
            (f"images/{identity}/probe-{pose}.png", identity, "probe", pose)
            for pose in PROBE_POSES
        )
    expected.update(
        (f"images/{NEGATIVE_IDENTITY}/probe-{pose}.png", NEGATIVE_IDENTITY, "probe", pose)
        for pose in PROBE_POSES
    )
    expected.update(
        (f"images/controls/{control}.png", None, "control", control)
        for control in CONTROLS
    )
    assert actual == expected


def test_manifest_entries_have_complete_synthetic_metadata() -> None:
    required = {"path", "identity", "use", "pose", "sha256", "width", "height", "synthetic"}
    entries = load_entries()
    for entry in entries:
        assert set(entry) == required
        assert entry["synthetic"] is True
        assert SHA256_RE.fullmatch(entry["sha256"])
        assert entry["width"] >= 512
        assert entry["height"] >= 512


def test_manifest_files_exist_and_match_recorded_metadata() -> None:
    for entry in load_entries():
        image_path = FIXTURE_ROOT / entry["path"]
        assert image_path.is_file(), image_path
        assert hashlib.sha256(image_path.read_bytes()).hexdigest() == entry["sha256"]
        assert png_size(image_path) == (entry["width"], entry["height"])


def test_committed_image_tree_has_only_manifest_files_and_no_links(validator_module) -> None:
    actual_files, _ = validator_module.enumerate_image_tree()
    expected_files = {
        Path(entry["path"]).relative_to("images")
        for entry in load_entries()
    }
    assert actual_files == expected_files


def test_manifest_rejects_duplicate_images() -> None:
    hashes = [entry["sha256"] for entry in load_entries()]
    assert len(hashes) == len(set(hashes))


def test_manifest_contains_no_real_person_names() -> None:
    entries = load_entries()
    allowed_identities = {*POSITIVE_IDENTITIES, NEGATIVE_IDENTITY, None}
    assert {entry["identity"] for entry in entries} <= allowed_identities
    manifest_text = MANIFEST_PATH.read_text(encoding="utf-8").lower()
    assert "name" not in manifest_text


def test_negative_identity_is_never_enrolled() -> None:
    assert not any(
        entry["identity"] == NEGATIVE_IDENTITY and entry["use"] == "enrollment"
        for entry in load_entries()
    )


def test_validator_rejects_unexpected_non_png_file(minimal_validator_tree, validator_module) -> None:
    images_root, _ = minimal_validator_tree
    (images_root / "source-notes.txt").write_text("not part of the corpus", encoding="utf-8")

    with pytest.raises(ValueError, match="unexpected"):
        validator_module.build_manifest()


def test_validator_rejects_expected_path_symlink_to_external_file(
    minimal_validator_tree, validator_module, tmp_path: Path
) -> None:
    images_root, expected_path = minimal_validator_tree
    external = tmp_path / "outside.png"
    external.write_bytes(b"external synthetic fixture bytes")
    expected_path.unlink()
    try:
        expected_path.symlink_to(external)
    except OSError as error:
        if os.name != "nt":
            pytest.skip(f"file symlink creation unsupported on this platform: {error}")
        expected_path.parent.rmdir()
        external_directory = tmp_path / "external-fixtures"
        external_directory.mkdir()
        (external_directory / expected_path.name).write_bytes(b"external synthetic fixture bytes")
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(images_root / "synth-01"), str(external_directory)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            pytest.skip(f"symlink and junction creation unsupported: {error}; {result.stderr}")

    with pytest.raises(ValueError, match="symlink|reparse|outside"):
        validator_module.build_manifest()
