import type {
  DurationValue,
  TupletInfo,
} from './types';
import { getDurationBeats } from './durations';

const TUPLET_SLOT_DURATION_OPTIONS: DurationValue[] = [
  'whole',
  'half',
  'quarter',
  'eighth',
  'sixteenth',
  'thirtySecond',
];

export const DEFAULT_TUPLET_NORMAL_NOTES = 2;
export const SUPPORTED_TUPLET_ACTUAL_NOTES = [
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
] as const;

export type SupportedTupletActualNotes =
  (typeof SUPPORTED_TUPLET_ACTUAL_NOTES)[number];

export function getDefaultTupletNormalNotes(
  actualNotes: SupportedTupletActualNotes,
) {
  if (actualNotes <= 2) {
    return 1;
  }

  if (actualNotes <= 4) {
    return 2;
  }

  if (actualNotes <= 8) {
    return 4;
  }

  return 8;
}

export function getTupletSlotDuration(
  totalDuration: DurationValue,
  actualNotes: SupportedTupletActualNotes,
  normalNotes = getDefaultTupletNormalNotes(actualNotes),
) {
  if (!isSupportedTupletActualNotes(actualNotes) || normalNotes <= 0) {
    return null;
  }

  const targetSlotBeats = getDurationBeats(totalDuration) / normalNotes;

  return (
    TUPLET_SLOT_DURATION_OPTIONS.find(
      (duration) =>
        Math.abs(getDurationBeats(duration) - targetSlotBeats) < 0.0001,
    ) ?? null
  );
}

export function getTupletSlotEffectiveBeats(
  slotDuration: DurationValue,
  actualNotes: SupportedTupletActualNotes,
  normalNotes = getDefaultTupletNormalNotes(actualNotes),
) {
  return getDurationBeats(slotDuration) * (normalNotes / actualNotes);
}

export function createTupletInfo({
  actualNotes,
  id,
  index,
  normalNotes = getDefaultTupletNormalNotes(actualNotes),
}: {
  actualNotes: SupportedTupletActualNotes;
  id: string;
  index: number;
  normalNotes?: number;
}): TupletInfo {
  return {
    actualNotes,
    id,
    index,
    normalNotes,
  };
}

export function isSupportedTupletActualNotes(
  actualNotes: number,
): actualNotes is SupportedTupletActualNotes {
  return SUPPORTED_TUPLET_ACTUAL_NOTES.includes(
    actualNotes as SupportedTupletActualNotes,
  );
}
