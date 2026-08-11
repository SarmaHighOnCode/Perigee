# Synthetic face evaluation corpus

This directory contains a developer-only, fully generated evaluation corpus for
Perigee's on-device face pipeline. Every depicted adult is fictional. No image
was downloaded, no real person's photograph was used as a reference, and the
prompts explicitly exclude celebrity or public-figure resemblance.

## Inventory

- `synth-01` through `synth-05`: six enrollment images and three probe images
  per identity (45 images total).
- `synth-06`: three probe-only images used as a never-enrolled negative identity.
- Four controls: `no-face`, `two-faces`, `blurred-face`, and `dark-face`.

The 52 PNG files are at least 512 x 512. `prompts.json` records the fictional
identity descriptions, per-shot variations, generation date, tool, and shared
constraints. `manifest.json` is generated from the images and records the path,
identity, use, pose, SHA-256 digest, dimensions, and synthetic-data flag for each
file.

## Validate or regenerate metadata

From the repository root:

```powershell
backend\.venv\Scripts\python.exe testing\face-fixtures\scripts\validate_manifest.py
backend\.venv\Scripts\python.exe testing\face-fixtures\scripts\validate_manifest.py --check
backend\.venv\Scripts\python.exe -m pytest testing\face-fixtures\tests\test_manifest.py -q
```

The generator enforces the exact inventory, validates PNG chunk CRCs, rejects
images below 512 x 512 and duplicate content, then emits sorted deterministic
JSON. The committed images are evaluation fixtures, not a claim of biometric
accuracy or production readiness.
