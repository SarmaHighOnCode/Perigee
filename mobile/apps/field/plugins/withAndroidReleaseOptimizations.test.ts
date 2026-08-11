// @ts-nocheck -- Expo loads the production config plugin as CommonJS.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  injectAbiSplits,
  injectVisionCameraFeatureFlag,
  upsertGradleProperty,
} = require('./withAndroidReleaseOptimizations.cjs');

describe('Field Android optimization plugin', () => {
  it('adds only Pixel hardware and emulator ABI outputs without a universal APK', () => {
    const source = `android {\n    packagingOptions {\n    }\n}`;
    const result = injectAbiSplits(source);
    expect(result).toContain('include "arm64-v8a", "x86_64"');
    expect(result).toContain('universalApk false');
    expect(result).not.toContain('armeabi-v7a');
    expect(injectAbiSplits(result)).toBe(result);
  });

  it('enables VisionCamera RawProps JSI before Expo creates the runtime', () => {
    const source = `import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative\n\nclass MainApplication {\n  fun onCreate() {\n    loadReactNative(this)\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)\n  }\n}`;
    const result = injectVisionCameraFeatureFlag(source);
    expect(result).toContain('useRawPropsJsiValue(): Boolean = true');
    expect(result.indexOf('useRawPropsJsiValue')).toBeLessThan(
      result.indexOf('ApplicationLifecycleDispatcher.onApplicationCreate'),
    );
    expect(injectVisionCameraFeatureFlag(result)).toBe(result);
  });

  it('upserts image decoder properties without duplicates', () => {
    const properties = [{ type: 'property', key: 'expo.gif.enabled', value: 'true' }];
    upsertGradleProperty(properties, 'expo.gif.enabled', 'false');
    upsertGradleProperty(properties, 'expo.webp.enabled', 'false');
    upsertGradleProperty(properties, 'expo.webp.enabled', 'false');
    expect(properties).toEqual([
      { type: 'property', key: 'expo.gif.enabled', value: 'false' },
      { type: 'property', key: 'expo.webp.enabled', value: 'false' },
    ]);
  });
});
