import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { summarizeChecks } from '../diagnostics/checks';
import { summarizeTimings } from '../diagnostics/timing';
import { formatBytes } from '../media/metadata';
import { palette } from '../theme';
import type { EvidenceCheck, MediaRecord } from '../types';
import { Brut } from './Brut';

interface EvidencePanelProps {
  media: MediaRecord | null;
  checks: EvidenceCheck[];
  captureSamplesMs: number[];
  onPickGallery: () => void;
  onSaveToGallery: () => void;
  onShareMedia: () => void;
  onCopyReport: () => void;
  onShareReport: () => void;
}

export function EvidencePanel({
  media,
  checks,
  captureSamplesMs,
  onPickGallery,
  onSaveToGallery,
  onShareMedia,
  onCopyReport,
  onShareReport,
}: EvidencePanelProps) {
  const timing = summarizeTimings(captureSamplesMs);
  const summary = summarizeChecks(checks);

  return (
    <View style={styles.stack}>
      <Brut tone="paper" style={styles.panel}>
        <Text style={styles.title}>LAST PHOTO</Text>
        {media ? (
          <>
            <Image contentFit="contain" source={media.uri} style={styles.preview} />
            <View style={styles.metrics}>
              <Metric
                label="SIZE"
                value={
                  media.width && media.height
                    ? `${media.width} × ${media.height}`
                    : 'UNKNOWN'
                }
              />
              <Metric label="QUALITY" value={media.megapixels === null ? 'UNKNOWN' : `${media.megapixels} MP`} />
              <Metric label="FILE" value={formatBytes(media.bytes)} />
            </View>
          </>
        ) : (
          <Text style={styles.empty}>
            Capture a processed native photo or import an original from the system picker.
          </Text>
        )}

        <View style={styles.actionGrid}>
          <Action label="GALLERY" tone="data" onPress={onPickGallery} />
          <Action
            label="SAVE"
            tone="clear"
            disabled={!media || media.source !== 'camera'}
            onPress={onSaveToGallery}
          />
          <Action
            label="SHARE"
            tone="signal"
            disabled={!media}
            onPress={onShareMedia}
          />
        </View>
      </Brut>

      <Brut tone="paper" style={styles.panel}>
        <Text style={styles.title}>TEST STATUS</Text>
        {timing ? (
          <Text style={styles.timing}>
            {timing.count} CAPTURE{timing.count === 1 ? '' : 'S'} · {timing.medianMs} ms MEDIAN
          </Text>
        ) : (
          <Text style={styles.timing}>TAKE A PHOTO TO START THE TEST</Text>
        )}
        <View style={styles.summaryGrid}>
          <Summary label="PASS" value={summary.pass} tone="clear" />
          <Summary label="FAIL" value={summary.fail} tone="alert" />
          <Summary label="WAITING" value={summary.notTested} tone="warn" />
          <Summary label="N/A" value={summary.unsupported} tone="data" />
        </View>
        <Text style={styles.reportHint}>Full capability details stay available in the JSON report.</Text>
        <View style={styles.actionGrid}>
          <Action label="COPY REPORT" tone="data" onPress={onCopyReport} />
          <Action label="SHARE REPORT" tone="signal" onPress={onShareReport} />
        </View>
      </Brut>
    </View>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'clear' | 'alert' | 'warn' | 'data';
}) {
  return (
    <View style={[styles.summary, { backgroundColor: palette[tone] }]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text selectable style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function Action({
  label,
  tone,
  disabled = false,
  onPress,
}: {
  label: string;
  tone: 'data' | 'clear' | 'signal';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: palette[tone] },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 18,
  },
  panel: {
    gap: 12,
    padding: 14,
  },
  title: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  preview: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
    borderWidth: 3,
    height: 280,
    width: '100%',
  },
  empty: {
    borderColor: palette.ink,
    borderStyle: 'dashed',
    borderWidth: 2,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
    padding: 16,
  },
  metrics: {
    borderLeftColor: palette.data,
    borderLeftWidth: 7,
    gap: 7,
    paddingLeft: 10,
  },
  metric: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: palette.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  metricValue: {
    color: palette.ink,
    flex: 1,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'right',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    borderColor: palette.ink,
    borderWidth: 3,
    flexGrow: 1,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionText: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  timing: {
    backgroundColor: palette.ink,
    color: palette.signal,
    fontSize: 11,
    fontWeight: '800',
    padding: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  summary: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderWidth: 2,
    flex: 1,
    paddingVertical: 8,
  },
  summaryValue: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  summaryLabel: {
    color: palette.ink,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  reportHint: {
    color: palette.ink,
    fontSize: 11,
    lineHeight: 16,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
});
