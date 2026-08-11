/**
 * Camera surface for Perigee.
 *
 * The VisionCamera 5 integration is taken from
 * testing/testcamera/src/components/CameraStage.tsx, which was verified on a
 * Pixel 7 emulator at 1280x960. VisionCamera 5's output API (usePhotoOutput,
 * Constraint[], capturePhoto, saveToTemporaryFileAsync, dispose) is materially
 * different from v4 — do not "modernise" it against v4 examples found online.
 *
 * What changed from the prototype: the lab's controls and evidence panel are
 * gone. A field officer holding a phone one-handed in sunlight does not adjust
 * HDR. The capability guards remain because the hardware still varies.
 */

import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  type CameraDevice,
  type Constraint,
  useCameraDevices,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { DEFAULT_CAPTURE_SETTINGS, guardSettings, optionalNativeToggle } from './capabilities';
import { canCapture, captureBlockedReason, isCameraActive } from './lifecycle';
import type { CameraDescriptor, CameraPosition, CaptureResult, CaptureSettings } from './types';

const INK = '#0A0A0A';
const SIGNAL = '#FFE600';
const WARN = '#FF6B00';
const PAPER = '#FFFEF0';

export interface PerigeeCameraProps {
  onCapture: (result: CaptureResult) => void;
  onError: (message: string) => void;
  /** Rendered over the preview — the quality HUD and coaching line. */
  overlay?: React.ReactNode;
  /** Disables the shutter while the app is embedding or searching. */
  busy?: boolean;
  busyLabel?: string;
  captureLabel?: string;
  initialPosition?: 'back' | 'front';
}

function describeCamera(device: CameraDevice): CameraDescriptor {
  let photoResolutions: { width: number; height: number }[] = [];
  try {
    photoResolutions = device.getSupportedResolutions('photo');
  } catch {
    // Some emulator profiles throw here rather than returning an empty list.
    photoResolutions = [];
  }

  return {
    id: device.id,
    name: device.localizedName || device.modelID || device.id,
    position: device.position as CameraPosition,
    type: device.type,
    physicalDeviceCount: device.physicalDevices.length,
    isVirtual: device.isVirtualDevice,
    hasFlash: device.hasFlash,
    hasTorch: device.hasTorch,
    supportsFocus: device.supportsFocusMetering,
    supportsExposure: device.supportsExposureBias,
    supportsHdr: device.supportsPhotoHDR,
    supportsLowLight: device.supportsLowLightBoost,
    minZoom: device.minZoom,
    maxZoom: device.maxZoom,
    minExposure: device.minExposureBias,
    maxExposure: device.maxExposureBias,
    photoResolutions,
  };
}

export function PerigeeCamera({
  onCapture,
  onError,
  overlay,
  busy = false,
  busyLabel = 'WORKING…',
  captureLabel = 'CAPTURE',
  initialPosition = 'back',
}: PerigeeCameraProps) {
  const permission = useCameraPermission();
  const devices = useCameraDevices();
  const [position, setPosition] = useState<'back' | 'front'>(initialPosition);
  const [settings] = useState<CaptureSettings>(DEFAULT_CAPTURE_SETTINGS);
  const [capturing, setCapturing] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const startedAt = useRef(0);

  const device = useMemo(
    () => devices.find((candidate) => candidate.position === position),
    [devices, position],
  );
  const descriptor = useMemo(() => (device ? describeCamera(device) : null), [device]);
  const guarded = useMemo(
    () => (descriptor ? guardSettings(descriptor, settings) : DEFAULT_CAPTURE_SETTINGS),
    [descriptor, settings],
  );

  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.HIGHEST_4_3,
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'quality',
  });

  const constraints = useMemo<Constraint[]>(() => {
    const selected: Constraint[] = [{ resolutionBias: photoOutput }];
    if (guarded.hdr) selected.push({ photoHDR: true });
    if (guarded.lowLight) selected.push({ binned: true });
    return selected;
  }, [guarded.hdr, guarded.lowLight, photoOutput]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setSessionRunning(false);
    setPreviewRunning(false);
  }, [descriptor]);

  const available = canCapture(sessionRunning, previewRunning, appState, capturing) && !busy;
  const blocked = busy ? busyLabel : captureBlockedReason(sessionRunning, previewRunning, appState, capturing);

  const takePhoto = useCallback(async () => {
    if (!available || !descriptor) return;
    setCapturing(true);
    startedAt.current = performance.now();
    try {
      const photo = await photoOutput.capturePhoto(
        {
          flashMode: guarded.flash,
          enableDistortionCorrection: device?.supportsDistortionCorrection ?? false,
          enableVirtualDeviceFusion: true,
          enableRedEyeReduction: true,
          // The shutter sound is deliberate. Every capture in Perigee is an
          // overt act during a face-to-face interaction; the person being
          // photographed must be able to tell it is happening.
          enableShutterSound: true,
        },
        {},
      );
      try {
        const uri = await photo.saveToTemporaryFileAsync();
        let bytes: number | null = null;
        try {
          bytes = new File(uri).info().size ?? null;
        } catch {
          bytes = null;
        }
        onCapture({
          uri,
          width: photo.width,
          height: photo.height,
          bytes,
          mimeType: `image/${photo.containerFormat}`,
          capturedAt: new Date().toISOString(),
          latencyMs: performance.now() - startedAt.current,
        });
      } finally {
        // Native buffers are not garbage collected. Leaking them OOMs the app
        // after a few dozen captures.
        photo.dispose();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapturing(false);
    }
  }, [available, descriptor, device, guarded.flash, onCapture, onError, photoOutput]);

  if (!permission.hasPermission) {
    return (
      <View style={[styles.card, { backgroundColor: SIGNAL }]}>
        <Text style={styles.title}>CAMERA PERMISSION REQUIRED</Text>
        <Text style={styles.body}>
          Perigee cannot verify identity without the camera. Status: {permission.status}.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!permission.canRequestPermission}
          onPress={() => void permission.requestPermission()}
          style={({ pressed }) => [
            styles.action,
            pressed && styles.pressed,
            !permission.canRequestPermission && styles.disabled,
          ]}
        >
          <Text style={styles.actionText}>
            {permission.canRequestPermission ? 'GRANT CAMERA' : 'ENABLE IN SETTINGS'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!device || !descriptor) {
    return (
      <View style={[styles.card, { backgroundColor: WARN }]}>
        <ActivityIndicator color={INK} />
        <Text style={styles.title}>DISCOVERING CAMERAS</Text>
      </View>
    );
  }

  const hasAlternate = devices.some(
    (candidate) => candidate.position === (position === 'back' ? 'front' : 'back'),
  );
  const distortion = optionalNativeToggle(device.supportsDistortionCorrection, true);
  const lowLight = optionalNativeToggle(descriptor.supportsLowLight, guarded.lowLight);

  return (
    <View style={styles.root}>
      <View style={styles.frame}>
        <Camera
          {...(distortion === undefined ? {} : { enableDistortionCorrection: distortion })}
          {...(lowLight === undefined ? {} : { enableLowLightBoost: lowLight })}
          constraints={constraints}
          device={device}
          enableNativeTapToFocusGesture={descriptor.supportsFocus}
          exposure={guarded.exposure}
          isActive={isCameraActive(appState)}
          onError={(error) => onError(error.message)}
          onPreviewStarted={() => setPreviewRunning(true)}
          onPreviewStopped={() => setPreviewRunning(false)}
          onStarted={() => setSessionRunning(true)}
          onStopped={() => setSessionRunning(false)}
          outputs={[photoOutput]}
          style={StyleSheet.absoluteFill}
          zoom={guarded.zoom}
        />
        {overlay}
      </View>

      {/* Bottom-anchored: nothing consequential lives in the top third of a
          Field screen, because it cannot be reached one-handed on a 6.7". */}
      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="Switch camera"
          accessibilityRole="button"
          disabled={!hasAlternate}
          onPress={() => setPosition((c) => (c === 'back' ? 'front' : 'back'))}
          style={({ pressed }) => [
            styles.lens,
            pressed && styles.pressed,
            !hasAlternate && styles.disabled,
          ]}
        >
          <Text style={styles.lensText}>{position === 'back' ? 'REAR' : 'FRONT'}</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Capture"
          accessibilityRole="button"
          disabled={!available}
          onPress={() => void takePhoto()}
          style={({ pressed }) => [
            styles.capture,
            pressed && styles.pressed,
            !available && styles.disabled,
          ]}
        >
          <Text style={styles.captureText}>{blocked ?? captureLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  frame: {
    borderColor: INK,
    borderWidth: 3,
    flex: 1,
    overflow: 'hidden',
  },
  controls: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
  },
  lens: {
    alignItems: 'center',
    backgroundColor: PAPER,
    borderColor: INK,
    borderWidth: 3,
    justifyContent: 'center',
    minHeight: 64,
    width: 88,
  },
  lensText: { color: INK, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  capture: {
    alignItems: 'center',
    backgroundColor: SIGNAL,
    borderColor: INK,
    borderWidth: 3,
    flex: 1,
    justifyContent: 'center',
    // 64dp: one-handed, gloved, under stress. docs/07 §5.
    minHeight: 64,
  },
  captureText: { color: INK, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  card: { borderColor: INK, borderWidth: 3, gap: 12, padding: 16 },
  title: { color: INK, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  body: { color: INK, fontSize: 14, lineHeight: 20 },
  action: {
    alignItems: 'center',
    backgroundColor: PAPER,
    borderColor: INK,
    borderWidth: 3,
    justifyContent: 'center',
    minHeight: 56,
    padding: 12,
  },
  actionText: { color: INK, fontWeight: '900', letterSpacing: 0.8 },
  pressed: { transform: [{ translateX: 3 }, { translateY: 3 }] },
  disabled: { opacity: 0.45 },
});
