# Verified InsightFace model preparation

This is developer-only tooling for Perigee's synthetic-image, on-device
face-recognition pipeline. It downloads the official InsightFace `buffalo_l`
v0.7 release for non-commercial research/hackathon use, validates the archive,
and exports only `det_10g.onnx` and `w600k_r50.onnx`.

The FastAPI backend does not import this tool and does not depend on ONNX,
OpenCV, or any image runtime.

## Setup and use

```powershell
python -m venv testing/face-models/.venv
testing\face-models\.venv\Scripts\python.exe -m pip install -r testing/face-models/requirements.txt
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py prepare
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py inspect
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py serve --host 0.0.0.0 --port 8765
```

`prepare` streams to `cache/buffalo_l.zip.partial`, checks the exact archive
length and SHA-256, runs ZIP CRC validation, then atomically publishes each
verified model. It writes `cache/models/manifest.json` with local URLs rooted
at `http://127.0.0.1:8765`.

All archives, extracted models, and virtual environments are ignored by Git.
Never add model binaries or real-person images to the repository.
