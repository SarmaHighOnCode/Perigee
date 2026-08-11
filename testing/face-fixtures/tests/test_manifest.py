import hashlib
import json
import re
import struct
from collections import Counter
from pathlib import Path

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
