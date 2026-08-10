# Physical device camera verification

Use a real Android phone. An emulator can prove navigation and permission flows, but it cannot prove camera quality, low-light processing, lens behavior, or gallery interoperability with real media.

## Setup

- Clean the phone lenses.
- Disable beauty filters, scene enhancers, and watermarks in the stock camera where possible.
- Use the same rear lens, 4:3 aspect ratio, framing, subject distance, and device position for both apps.
- Do not compare a digital zoom crop from one app with an optical lens switch in the other.
- Keep the original files. Do not use messaging-app copies because they are commonly resized or recompressed.
- In Camera Lab, confirm DEVICE, CAMERA, CAMERA READY, and FULL-RES CAPTURE reach PASS.

## Matched scenes

Capture one Camera Lab image and one stock-camera image for each scene:

1. Bright daylight with fine detail such as foliage, text, or brick.
2. Indoor mixed lighting with both warm and cool light sources.
3. Backlit subject with bright sky or window highlights.
4. Low light with shadow detail and a small bright light source.
5. Close subject that makes tap-to-focus behavior obvious.
6. Moving subject to expose shutter lag and motion blur.

For every scene, tap the same subject to focus, hold the phone still, and capture within a few seconds so lighting does not materially change. Repeat each pair three times; a single lucky frame is not evidence.

## Record evidence

- Keep Camera Lab's JSON report for every test session.
- Record the phone manufacturer, model, Android version, selected lens, enabled HDR/low-light state, flash state, dimensions, megapixels, file size, capture time, and any native error.
- Open Camera Lab's system picker and import one stock-camera original. Confirm its original dimensions and file size appear without an editing crop.
- Save a Camera Lab capture to the gallery, close the app, and confirm it remains visible in the phone's gallery.
- Share both a captured image and the JSON report through the Android share sheet.

## Compare at 100 percent

Judge the original files at the same display scale. Check:

- Resolved fine detail without excessive sharpening halos
- Highlight retention in sky, windows, and lamps
- Shadow noise, color blotching, and smearing
- White balance and skin-tone stability
- Focus hit rate across the three repetitions
- Motion blur and capture responsiveness
- Whether HDR or low-light mode creates ghosting

The result supports Expo for Perigee only when camera capture, gallery import, gallery save, and sharing work reliably and the output is acceptable for the product's actual scenes. A difference from the stock app can come from OEM-only computational photography unavailable to all third-party Camera2 apps; classify that separately from an Expo integration failure.

## Acceptance gate

- No crash or native module error in 20 consecutive captures.
- All six scene pairs completed three times.
- Original Camera Lab dimensions match the selected highest advertised photo output.
- Gallery import preserves the chosen original's dimensions.
- Saved Camera Lab photos survive app restart and appear in the system gallery.
- Native share succeeds for media and JSON evidence.
- Unsupported controls are labeled UNSUPPORTED and do not crash capture.
- The team accepts the matched image-quality comparison for Perigee's use case.

