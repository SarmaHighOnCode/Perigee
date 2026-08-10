import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  CameraStage,
  type CameraCaptureEvent,
} from './src/components/CameraStage';
import { EvidencePanel } from './src/components/EvidencePanel';
import { StatusChip } from './src/components/StatusChip';
import { hasUnresolvedCameraFailure } from './src/diagnostics/checks';
import { buildReport, serializeReport } from './src/diagnostics/report';
import { normalizeMedia } from './src/media/metadata';
import {
  cameraPermissionCheck,
  hasCameraPermission,
} from './src/permissions/cameraPermission';
import { palette } from './src/theme';
import type {
  CameraDescriptor,
  CaptureSettings,
  CheckStatus,
  DeviceRecord,
  EvidenceCheck,
  MediaRecord,
} from './src/types';

const INITIAL_CHECKS: EvidenceCheck[] = [
  {
    id: 'expo-native-runtime',
    label: 'Expo native development build',
    status: 'PASS',
    detail: 'Running inside the generated Android binary, not Expo Go.',
  },
  {
    id: 'camera-ready',
    label: 'Native CameraX preview',
    status: 'NOT_TESTED',
    detail: 'Waiting for the first native preview frame.',
  },
  {
    id: 'capture',
    label: 'Full-quality processed capture',
    status: 'NOT_TESTED',
    detail: 'Capture a photo to measure resolution, bytes, and latency.',
  },
  {
    id: 'gallery-import',
    label: 'System photo picker',
    status: 'NOT_TESTED',
    detail: 'Import an original image through Android Photo Picker.',
  },
  {
    id: 'gallery-save',
    label: 'Media library save',
    status: 'NOT_TESTED',
    detail: 'Save a native camera capture to the phone gallery.',
  },
  {
    id: 'media-share',
    label: 'Android share sheet',
    status: 'NOT_TESTED',
    detail: 'Share the selected local media file.',
  },
  {
    id: 'exif-readback',
    label: 'VisionCamera EXIF readback',
    status: 'UNSUPPORTED',
    detail: 'VisionCamera 5 exposes dimensions and format but marks EXIF access as pending.',
  },
  {
    id: 'stock-comparison',
    label: 'Stock-camera quality parity',
    status: 'NOT_TESTED',
    detail: 'Requires the same real scene captured in this app and the OEM camera app.',
  },
];

export default function App() {
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [cameraPermission, setCameraPermission] = useState('not-determined');
  const [cameras, setCameras] = useState<CameraDescriptor[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<CameraDescriptor | null>(null);
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [media, setMedia] = useState<MediaRecord | null>(null);
  const [captureSamplesMs, setCaptureSamplesMs] = useState<number[]>([]);
  const [checks, setChecks] = useState<EvidenceCheck[]>(INITIAL_CHECKS);
  const [errors, setErrors] = useState<string[]>([]);

  const deviceRecord = useMemo<DeviceRecord>(
    () => ({
      manufacturer: Device.manufacturer ?? 'Unknown',
      model: Device.modelName ?? Device.modelId ?? 'Unknown',
      osVersion: Device.osVersion ?? 'Unknown',
      apiLevel: Device.platformApiLevel,
      physicalDevice: Device.isDevice,
    }),
    [],
  );

  const setCheck = useCallback(
    (id: string, label: string, status: CheckStatus, detail: string) => {
      setChecks((current) => {
        const next = { id, label, status, detail } satisfies EvidenceCheck;
        const exists = current.some((check) => check.id === id);
        return exists
          ? current.map((check) => (check.id === id ? next : check))
          : [...current, next];
      });
    },
    [],
  );

  const handlePermission = useCallback(
    (status: string) => {
      setCameraPermission(status);
      setCheck(
        'camera-permission',
        'Camera permission',
        cameraPermissionCheck(status),
        `Native permission status: ${status}`,
      );
    },
    [setCheck],
  );

  const handleCameras = useCallback(
    (next: CameraDescriptor[]) => {
      setCameras(next);
      setCheck(
        'camera-discovery',
        'Camera capability discovery',
        next.length > 0 ? 'PASS' : 'NOT_TESTED',
        next.length > 0 ? `${next.length} native camera device(s) reported.` : 'Waiting for CameraX devices.',
      );
    },
    [setCheck],
  );

  const handleSelectedCamera = useCallback(
    (next: CameraDescriptor | null) => {
      setSelectedCamera(next);
      if (!next) return;
      setCheck(
        'photo-hdr',
        'Processed photo HDR capability',
        next.supportsHdr ? 'NOT_TESTED' : 'UNSUPPORTED',
        next.supportsHdr ? 'Device reports HDR support; enable it and capture.' : 'Selected camera does not expose photo HDR.',
      );
      setCheck(
        'low-light',
        'Native low-light boost',
        next.supportsLowLight ? 'NOT_TESTED' : 'UNSUPPORTED',
        next.supportsLowLight ? 'Device reports low-light boost support; enable it and capture.' : 'Selected camera does not expose low-light boost.',
      );
      setCheck(
        'native-focus',
        'Native tap-to-focus',
        next.supportsFocus ? 'NOT_TESTED' : 'UNSUPPORTED',
        next.supportsFocus ? 'Native tap gesture is enabled on the preview.' : 'Selected camera is fixed-focus.',
      );
    },
    [setCheck],
  );

  const handleSettings = useCallback((next: CaptureSettings | null) => {
    setSettings(next);
  }, []);

  const handleCameraReady = useCallback(
    (latencyMs: number) => {
      setCheck(
        'camera-ready',
        'Native CameraX preview',
        'PASS',
        `First preview frame arrived in ${latencyMs.toFixed(1)} ms.`,
      );
    },
    [setCheck],
  );

  const handleCapture = useCallback(
    ({ media: captured, latencyMs }: CameraCaptureEvent) => {
      setMedia(captured);
      setCaptureSamplesMs((current) => [...current, latencyMs]);
      setCheck(
        'capture',
        'Full-quality processed capture',
        captured.width && captured.height && captured.bytes ? 'PASS' : 'FAIL',
        `${captured.width ?? '?'} × ${captured.height ?? '?'} · ${captured.bytes ?? '?'} bytes · ${latencyMs.toFixed(1)} ms`,
      );
      setCheck(
        'camera-runtime',
        'Native camera runtime',
        'PASS',
        'The native session completed a processed photo capture.',
      );
      if (settings?.hdr) {
        setCheck('photo-hdr', 'Processed photo HDR capability', 'PASS', 'HDR was requested in the negotiated camera constraints for this capture.');
      }
      if (settings?.lowLight) {
        setCheck('low-light', 'Native low-light boost', 'PASS', 'Low-light boost and binned preference were requested for this capture.');
      }
    },
    [setCheck, settings],
  );

  const handleCameraError = useCallback(
    (message: string) => {
      setErrors((current) => [...current.slice(-9), message]);
      setCheck('camera-runtime', 'Native camera runtime', 'FAIL', message);
    },
    [setCheck],
  );

  async function pickFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled) {
        setCheck('gallery-import', 'System photo picker', 'NOT_TESTED', 'Picker was cancelled; no failure recorded.');
        return;
      }
      const asset = result.assets[0];
      if (!asset) throw new Error('Android photo picker returned no image asset.');
      setMedia(
        normalizeMedia({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          bytes: asset.fileSize ?? null,
          mimeType: asset.mimeType ?? null,
          source: 'gallery',
          acquiredAt: new Date().toISOString(),
        }),
      );
      setCheck(
        'gallery-import',
        'System photo picker',
        'PASS',
        `Imported ${asset.width} × ${asset.height} without editing.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((current) => [...current.slice(-9), message]);
      setCheck('gallery-import', 'System photo picker', 'FAIL', message);
    }
  }

  async function saveToGallery() {
    if (!media || media.source !== 'camera') return;
    try {
      let permission = mediaPermission;
      if (!permission?.granted) permission = await requestMediaPermission();
      if (!permission?.granted) throw new Error('Media-library write permission was not granted.');
      await MediaLibrary.saveToLibraryAsync(media.uri);
      setCheck('gallery-save', 'Media library save', 'PASS', 'Capture saved through Android MediaStore.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((current) => [...current.slice(-9), message]);
      setCheck('gallery-save', 'Media library save', 'FAIL', message);
    }
  }

  async function shareMedia() {
    if (!media) return;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Android sharing is unavailable.');
      await Sharing.shareAsync(media.uri, {
        dialogTitle: 'Share Perigee camera sample',
        mimeType: media.mimeType,
      });
      setCheck('media-share', 'Android share sheet', 'PASS', 'Native share sheet opened for selected media.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((current) => [...current.slice(-9), message]);
      setCheck('media-share', 'Android share sheet', 'FAIL', message);
    }
  }

  const currentReport = useCallback(() => {
    return buildReport({
      generatedAt: new Date().toISOString(),
      device: deviceRecord,
      permissions: {
        camera: cameraPermission,
        mediaLibrary: mediaPermission?.status ?? 'not-determined',
      },
      cameras,
      selectedCamera,
      settings,
      media,
      captureSamplesMs,
      checks: [
        ...checks,
        {
          id: 'physical-device',
          label: 'Physical Android device',
          status: deviceRecord.physicalDevice ? 'PASS' : 'FAIL',
          detail: deviceRecord.physicalDevice ? `${deviceRecord.manufacturer} ${deviceRecord.model}` : 'Emulator detected; image-quality evidence is invalid.',
        },
      ],
      errors,
    });
  }, [
    cameraPermission,
    cameras,
    captureSamplesMs,
    checks,
    deviceRecord,
    errors,
    media,
    mediaPermission?.status,
    selectedCamera,
    settings,
  ]);

  async function copyReport() {
    const json = serializeReport(currentReport());
    await Clipboard.setStringAsync(json);
    Alert.alert('REPORT COPIED', 'The complete diagnostic report is on the clipboard.');
  }

  async function shareReport() {
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Android sharing is unavailable.');
      const file = new File(Paths.cache, 'perigee-camera-report.json');
      if (file.exists) file.delete();
      file.create();
      file.write(serializeReport(currentReport()));
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Share Perigee camera diagnostic report',
        mimeType: 'application/json',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((current) => [...current.slice(-9), message]);
      Alert.alert('REPORT EXPORT FAILED', message);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.content}
          removeClippedSubviews={false}
        >
        <View style={styles.header}>
          <Text style={styles.wordmark}>▓▓ PERIGEE // CAMERA TEST</Text>
          <Text style={styles.subtitle}>LOCAL EXPO CAMERA · NO CLOUD BUILD</Text>
        </View>

        <View style={styles.readiness}>
          <Readiness
            label="RUNTIME"
            value={deviceRecord.physicalDevice ? deviceRecord.model : 'Pixel emulator'}
            status="PASS"
          />
          <Readiness label="CAMERA" value={cameraPermission} status={hasCameraPermission(cameraPermission) ? 'PASS' : 'NOT_TESTED'} />
          <Readiness label="GALLERY" value={mediaPermission?.status ?? 'not-determined'} status={mediaPermission?.granted ? 'PASS' : 'NOT_TESTED'} />
        </View>

        <CameraStage
          onCameraReady={handleCameraReady}
          onCamerasChange={handleCameras}
          onCapture={handleCapture}
          onError={handleCameraError}
          onPermissionChange={handlePermission}
          onSelectedCameraChange={handleSelectedCamera}
          onSettingsChange={handleSettings}
        />

        {!hasCameraPermission(cameraPermission) && cameraPermission !== 'not-determined' ? (
          <Text onPress={() => void Linking.openSettings()} style={styles.settingsLink}>
            OPEN ANDROID SETTINGS →
          </Text>
        ) : null}

        {errors.length > 0 && hasUnresolvedCameraFailure(checks) ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorTitle}>LATEST NATIVE ERROR</Text>
            <Text selectable style={styles.errorText}>{errors.at(-1)}</Text>
          </View>
        ) : null}

        <EvidencePanel
          captureSamplesMs={captureSamplesMs}
          checks={checks}
          media={media}
          onCopyReport={() => void copyReport()}
          onPickGallery={() => void pickFromGallery()}
          onSaveToGallery={() => void saveToGallery()}
          onShareMedia={() => void shareMedia()}
          onShareReport={() => void shareReport()}
        />

        <Text style={styles.footer}>
          EMULATOR TESTS THE APP. USE A REAL PHONE TO JUDGE PHOTO QUALITY.
        </Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Readiness({ label, value, status }: { label: string; value: string; status: CheckStatus }) {
  return (
    <View style={styles.readinessItem}>
      <View style={styles.readinessCopy}>
        <Text style={styles.readinessLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.readinessValue}>{value}</Text>
      </View>
      <StatusChip label={label} status={status} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.ink,
    flex: 1,
  },
  content: {
    backgroundColor: palette.paper,
    gap: 20,
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  header: {
    backgroundColor: palette.ink,
    marginHorizontal: -16,
    paddingBottom: 15,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  wordmark: {
    color: palette.signal,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: palette.data,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  readiness: {
    borderColor: palette.ink,
    borderWidth: 3,
    flexDirection: 'row',
  },
  readinessItem: {
    alignItems: 'stretch',
    borderRightColor: palette.ink,
    borderRightWidth: 2,
    flex: 1,
    gap: 6,
    padding: 8,
  },
  readinessCopy: {
    flex: 1,
  },
  readinessLabel: {
    color: palette.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  readinessValue: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  settingsLink: {
    alignSelf: 'flex-start',
    backgroundColor: palette.warn,
    borderColor: palette.ink,
    borderWidth: 3,
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
    padding: 12,
  },
  errorBlock: {
    backgroundColor: palette.alert,
    borderColor: palette.ink,
    borderWidth: 3,
    padding: 12,
  },
  errorTitle: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  errorText: {
    color: palette.ink,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  footer: {
    backgroundColor: palette.ink,
    color: palette.signal,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 17,
    marginHorizontal: -16,
    padding: 16,
    textAlign: 'center',
  },
});
