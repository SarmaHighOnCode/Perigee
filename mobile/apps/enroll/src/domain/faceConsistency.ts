import { aggregateEmbeddings, type QualityReport } from '@perigee/face';

export interface CaptureEmbedding {
  slot: string;
  embedding: Float32Array;
  quality: QualityReport;
}

export interface ConsistencyReport {
  isConsistent: boolean;
  medoidSlot: string | null;
  includedSlots: string[];
  rejectedSlots: string[];
  message: string | null;
}

export function checkFaceConsistency(
  captures: readonly CaptureEmbedding[],
): ConsistencyReport {
  if (captures.length === 0) {
    return {
      isConsistent: false,
      medoidSlot: null,
      includedSlots: [],
      rejectedSlots: [],
      message: 'No captures provided for consistency evaluation.',
    };
  }

  if (captures.length === 1) {
    return {
      isConsistent: true,
      medoidSlot: captures[0]!.slot,
      includedSlots: [captures[0]!.slot],
      rejectedSlots: [],
      message: null,
    };
  }

  try {
    const aggregate = aggregateEmbeddings(captures);
    const includedSlots = aggregate.includedIndexes.map((idx) => captures[idx]!.slot);
    const rejectedSlots = aggregate.rejectedIndexes.map((idx) => captures[idx]!.slot);
    const medoidSlot = captures[aggregate.medoidIndex]?.slot ?? null;

    const isConsistent = rejectedSlots.length === 0;
    const message = isConsistent
      ? null
      : `Inconsistent face captures detected in slots: ${rejectedSlots.join(', ')}. Please retake those captures.`;

    return {
      isConsistent,
      medoidSlot,
      includedSlots,
      rejectedSlots,
      message,
    };
  } catch (error) {
    return {
      isConsistent: false,
      medoidSlot: null,
      includedSlots: [],
      rejectedSlots: captures.map((c) => c.slot),
      message: error instanceof Error ? error.message : 'Face captures are inconsistent',
    };
  }
}
