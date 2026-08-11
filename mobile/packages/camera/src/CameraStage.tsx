import { palette, space, structure } from '@perigee/design-tokens';
import { Brut } from '@perigee/ui';
import { File } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  CommonResolutions,
  type CameraDevice,
  type Constraint,
  useCameraDevices,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { guardSettings, optionalNativeToggle } from './capabilities';
import { canCapture, isCameraActive } from './lifecycle';
import { normalizeMedia } from './media';
import type {
  CameraCaptureEvent,
  CameraDescriptor,
  CameraPosition,
  CaptureSettings,
} from './types';

export interface CameraStageProps {
  onCapture: (event: CameraCaptureEvent) => void;
  onError: (message: string) => void;
  onPermissionChange?: (status: string) => void;
  onCamerasChange?: (cameras: CameraDescriptor[]) => void;
  onSelectedCameraChange?: (camera: CameraDescriptor | null) => void;
  onSettingsChange?: (settings: CaptureSettings | null) => void;
  onCameraReady?: (latencyMs: number) => void;
  compact?: boolean;
}

const DEFAULT_SETTINGS: CaptureSettings = {
  flash: 'off',
  hdr: false,
  lowLight: false,
  zoom: 1,
  exposure: 0,
};

function describeCamera(device: CameraDevice): CameraDescriptor {
  let photoResolutions: { width: number; height: number }[] = [];
  try {
    photoResolutions = device.getSupportedResolutions('photo');
  } catch {
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

export function CameraStage({
  onCapture,
  onError,
  onPermissionChange,
  onCamerasChange,
  onSelectedCameraChange,
  onSettingsChange,
  onCameraReady,
  compact = false,
}: CameraStageProps) {
  const permission = useCameraPermission();
  const devices = useCameraDevices();
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const [settings, setSettings] = useState<CaptureSettings>(DEFAULT_SETTINGS);
  const [capturing, setCapturing] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const cameraStartedAt = useRef(performance.now());

  const device = useMemo(
    () => devices.find((candidate) => candidate.position === position),
    [devices, position],
  );
  const descriptors = useMemo(() => devices.map(describeCamera), [devices]);
  const descriptor = useMemo(() => (device ? describeCamera(device) : null), [device]);
  const guarded = useMemo(
    () => (descriptor ? guardSettings(descriptor, settings) : DEFAULT_SETTINGS),
    [descriptor, settings],
  );
  const captureAvailable = canCapture(
    sessionRunning,
    previewRunning,
    appState,
    capturing,
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
    onPermissionChange?.(permission.status);
  }, [onPermissionChange, permission.status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    onCamerasChange?.(descriptors);
  }, [descriptors, onCamerasChange]);

  useEffect(() => {
    onSelectedCameraChange?.(descriptor);
    setSessionRunning(false);
    setPreviewRunning(false);
    cameraStartedAt.current = performance.now();
    if (descriptor) setSettings((current) => guardSettings(descriptor, current));
  }, [descriptor, onSelectedCameraChange]);

  useEffect(() => {
    onSettingsChange?.(descriptor ? guarded : null);
  }, [descriptor, guarded, onSettingsChange]);

  async function takePhoto() {
    if (!captureAvailable || !descriptor) return;
    setCapturing(true);
    const startedAt = performance.now();
    try {
      const photo = await photoOutput.capturePhoto(
        {
          flashMode: guarded.flash,
          enableDistortionCorrection: device?.supportsDistortionCorrection ?? false,
          enableVirtualDeviceFusion: true,
          enableRedEyeReduction: true,
          enableShutterSound: true,
        },
        {},
      );
      try {
        const filePath = await photo.saveToTemporaryFileAsync();
        const preliminary = normalizeMedia({
          uri: filePath,
          width: photo.width,
          height: photo.height,
          mimeType: `image/${photo.containerFormat}`,
          source: 'camera',
          acquiredAt: new Date().toISOString(),
        });
        const media = normalizeMedia({
          ...preliminary,
          bytes: new File(preliminary.uri).info().size ?? null,
        });
        onCapture({ media, latencyMs: performance.now() - startedAt });
      } finally {
        photo.dispose();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapturing(false);
    }
  }

  if (!permission.hasPermission) {
    return (
      <Brut contentStyle={styles.messageBody} tone="signal">
        <Text style={styles.sectionTitle}>CAMERA PERMISSION</Text>
        <Text style={styles.body}>Camera access is required for native processed capture.</Text>
        <Pressable
          accessibilityRole="button"
          disabled={!permission.canRequestPermission}
          onPress={() => void permission.requestPermission()}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>
            {permission.canRequestPermission ? 'GRANT CAMERA' : 'OPEN ANDROID SETTINGS'}
          </Text>
        </Pressable>
      </Brut>
    );
  }

  if (!device || !descriptor) {
    return (
      <Brut contentStyle={styles.messageBody} tone="warn">
        <ActivityIndicator color={palette.ink} />
        <Text style={styles.sectionTitle}>DISCOVERING CAMERAS</Text>
      </Brut>
    );
  }

  const hasAlternate = devices.some(
    (candidate) => candidate.position === (position === 'back' ? 'front' : 'back'),
  );
  const zoomStep = Math.max((descriptor.maxZoom - descriptor.minZoom) / 10, 0.1);
  const exposureStep = Math.max(
    (descriptor.maxExposure - descriptor.minExposure) / 10,
    0.25,
  );
  const distortionCorrection = optionalNativeToggle(
    device.supportsDistortionCorrection,
    true,
  );
  const lowLightBoost = optionalNativeToggle(
    descriptor.supportsLowLight,
    guarded.lowLight,
  );

  return (
    <View style={styles.stage}>
      <View style={[styles.cameraFrame, compact && styles.cameraFrameCompact]}>
        <Camera
          {...(distortionCorrection === undefined
            ? {}
            : { enableDistortionCorrection: distortionCorrection })}
          {...(lowLightBoost === undefined
            ? {}
            : { enableLowLightBoost: lowLightBoost })}
          constraints={constraints}
          device={device}
          enableNativeTapToFocusGesture={descriptor.supportsFocus}
          exposure={guarded.exposure}
          isActive={isCameraActive(appState)}
          onError={(error) => onError(error.message)}
          onPreviewStarted={() => {
            setPreviewRunning(true);
            onCameraReady?.(performance.now() - cameraStartedAt.current);
          }}
          onPreviewStopped={() => setPreviewRunning(false)}
          onStarted={() => setSessionRunning(true)}
          onStopped={() => setSessionRunning(false)}
          outputs={[photoOutput]}
          style={StyleSheet.absoluteFill}
          zoom={guarded.zoom}
        />
        <View pointerEvents="none" style={styles.reticle}>
          <View style={styles.reticleBox} />
          <Text style={styles.reticleText}>TAP SUBJECT TO FOCUS</Text>
        </View>
        <View style={styles.cameraStatus}>
          <Text style={styles.cameraStatusText}>
            {captureAvailable ? 'CAMERA READY' : 'CONFIGURING CAMERA'}
          </Text>
        </View>
      </View>

      <View style={styles.controlGrid}>
        <Control
          disabled={!hasAlternate}
          label="LENS"
          onPress={() => setPosition((current) => (current === 'back' ? 'front' : 'back'))}
          value={position.toUpperCase()}
        />
        <Control
          disabled={!descriptor.hasFlash}
          label="FLASH"
          onPress={() => setSettings((current) => ({
            ...current,
            flash: current.flash === 'off' ? 'auto' : current.flash === 'auto' ? 'on' : 'off',
          }))}
          value={descriptor.hasFlash ? guarded.flash.toUpperCase() : 'UNSUPPORTED'}
        />
        <Control
          disabled={!descriptor.supportsHdr}
          label="HDR"
          onPress={() => setSettings((current) => ({ ...current, hdr: !current.hdr }))}
          value={descriptor.supportsHdr ? (guarded.hdr ? 'ON' : 'OFF') : 'UNSUPPORTED'}
        />
        <Control
          disabled={!descriptor.supportsLowLight}
          label="LOW LIGHT"
          onPress={() => setSettings((current) => ({ ...current, lowLight: !current.lowLight }))}
          value={descriptor.supportsLowLight ? (guarded.lowLight ? 'ON' : 'OFF') : 'UNSUPPORTED'}
        />
      </View>

      {!compact ? (
        <View style={styles.stepRow}>
          <Stepper
            disabled={descriptor.maxZoom <= descriptor.minZoom}
            label="ZOOM"
            onDecrease={() => setSettings((current) => ({ ...current, zoom: current.zoom - zoomStep }))}
            onIncrease={() => setSettings((current) => ({ ...current, zoom: current.zoom + zoomStep }))}
            value={`${guarded.zoom.toFixed(1)}×`}
          />
          <Stepper
            disabled={!descriptor.supportsExposure}
            label="EXPOSURE"
            onDecrease={() => setSettings((current) => ({ ...current, exposure: current.exposure - exposureStep }))}
            onIncrease={() => setSettings((current) => ({ ...current, exposure: current.exposure + exposureStep }))}
            value={`${guarded.exposure.toFixed(1)} EV`}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityLabel="Take full quality photo"
        accessibilityRole="button"
        accessibilityState={{ busy: capturing, disabled: !captureAvailable }}
        disabled={!captureAvailable}
        onPress={() => void takePhoto()}
        style={({ pressed }) => [
          styles.capture,
          pressed && styles.pressed,
          !captureAvailable && styles.disabled,
        ]}
      >
        <Text style={styles.captureText}>{capturing ? 'CAPTURING…' : 'TAKE PHOTO'}</Text>
      </Pressable>
    </View>
  );
}

function Control({
  label,
  value,
  disabled = false,
  onPress,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.control, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.controlLabel}>{label}</Text>
      <Text style={styles.controlValue}>{value}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  disabled = false,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={[styles.stepper, disabled && styles.disabled]}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable accessibilityLabel={`Decrease ${label}`} disabled={disabled} onPress={onDecrease} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{disabled ? 'UNSUPPORTED' : value}</Text>
        <Pressable accessibilityLabel={`Increase ${label}`} disabled={disabled} onPress={onIncrease} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { gap: space[2] },
  messageBody: { gap: space[3], padding: space[4] },
  sectionTitle: { color: palette.ink, fontFamily: 'Archivo', fontSize: 20, fontWeight: '900' },
  body: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 20 },
  action: {
    alignItems: 'center', backgroundColor: palette.paper, borderColor: palette.ink,
    borderWidth: structure.borderWidth, justifyContent: 'center', minHeight: 56, padding: 12,
  },
  actionText: { color: palette.ink, fontFamily: 'Archivo', fontWeight: '900', letterSpacing: 0.8 },
  cameraFrame: {
    backgroundColor: palette.ink, borderColor: palette.ink, borderWidth: structure.borderWidth,
    height: 430, overflow: 'hidden', position: 'relative',
  },
  cameraFrameCompact: { height: 360 },
  reticle: {
    alignItems: 'center', height: 132, justifyContent: 'center', left: '50%', marginLeft: -66,
    marginTop: -66, position: 'absolute', top: '50%', width: 132,
  },
  reticleBox: { borderColor: palette.signal, borderWidth: 3, height: 104, width: 84 },
  reticleText: {
    backgroundColor: palette.ink, color: palette.signal, fontFamily: 'MartianMono',
    fontSize: 10, fontWeight: '900', marginTop: 4, paddingHorizontal: 6, paddingVertical: 3,
  },
  cameraStatus: {
    backgroundColor: palette.signal, borderColor: palette.ink, borderRightWidth: 3,
    borderTopWidth: 3, bottom: 0, left: 0, paddingHorizontal: 10, paddingVertical: 6,
    position: 'absolute',
  },
  cameraStatusText: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 10, fontWeight: '900' },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  control: {
    backgroundColor: palette.data, borderColor: palette.ink, borderWidth: 3,
    flexBasis: '45%', flexGrow: 1, minHeight: 58, padding: 8,
  },
  controlLabel: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  controlValue: { color: palette.ink, fontFamily: 'Archivo', fontSize: 14, fontWeight: '900', marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepper: { backgroundColor: palette.paper, borderColor: palette.ink, borderWidth: 3, flex: 1, padding: 8 },
  stepperControls: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  stepButton: {
    alignItems: 'center', backgroundColor: palette.signal, borderColor: palette.ink,
    borderWidth: 2, height: 38, justifyContent: 'center', width: 38,
  },
  stepButtonText: { color: palette.ink, fontSize: 24, fontWeight: '900', lineHeight: 26 },
  stepValue: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900' },
  capture: {
    alignItems: 'center', backgroundColor: palette.signal, borderColor: palette.ink,
    borderWidth: structure.borderWidth, justifyContent: 'center', minHeight: 64,
    shadowColor: palette.ink, shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1, shadowRadius: 0,
  },
  captureText: { color: palette.ink, fontFamily: 'Archivo', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  pressed: { transform: [{ translateX: 3 }, { translateY: 3 }] },
  disabled: { opacity: 0.45 },
});
