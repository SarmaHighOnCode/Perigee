// @ts-nocheck -- Expo loads the production config plugin as CommonJS.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { injectAbiSplits, injectVisionCameraFeatureFlag, upsertGradleProperty } =
  require('./withAndroidReleaseOptimizations.cjs');

describe('Enroll Android optimization plugin', () => {
  it('emits arm64 and emulator x86_64 APKs with no universal output', () => {
    const result = injectAbiSplits('android {\n    packagingOptions {\n    }\n}');
    expect(result).toContain('include "arm64-v8a", "x86_64"');
    expect(result).toContain('universalApk false');
    expect(result).not.toContain('armeabi-v7a');
    expect(injectAbiSplits(result)).toBe(result);
  });

  it('enables the VisionCamera RawProps compatibility flag idempotently', () => {
    const source = 'import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative\n' +
      'class MainApplication { fun onCreate() {\n    loadReactNative(this)\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)\n} }';
    const result = injectVisionCameraFeatureFlag(source);
    expect(result).toContain('useRawPropsJsiValue(): Boolean = true');
    expect(injectVisionCameraFeatureFlag(result)).toBe(result);
  });

  it('disables unused image decoders without duplicate properties', () => {
    const properties = [{ type: 'property', key: 'expo.gif.enabled', value: 'true' }];
    upsertGradleProperty(properties, 'expo.gif.enabled', 'false');
    upsertGradleProperty(properties, 'expo.webp.enabled', 'false');
    upsertGradleProperty(properties, 'expo.webp.enabled', 'false');
    expect(properties).toHaveLength(2);
    expect(properties[0].value).toBe('false');
  });
});
