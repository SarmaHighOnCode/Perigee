from prepare_models import ARCHIVE, MODELS


def test_manifest_pins_the_official_archive():
    assert ARCHIVE.url.endswith("/v0.7/buffalo_l.zip")
    assert ARCHIVE.bytes == 288_621_354
    assert ARCHIVE.sha256 == "80ffe37d8a5940d59a7384c201a2a38d4741f2f3c51eef46ebb28218a7b0ca2f"


def test_only_required_models_are_exported():
    assert set(MODELS) == {"det_10g.onnx", "w600k_r50.onnx"}
    assert MODELS["det_10g.onnx"].sha256 == "5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91"
    assert MODELS["w600k_r50.onnx"].sha256 == "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43"
