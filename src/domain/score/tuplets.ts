import type {
  DurationValue,
  TupletInfo,
} from './types';
import { getDurationBeats } from './durations';

const NEXT_SHORTER_DURATION: Partial<Record<DurationValue, DurationValue>> = {
  whole: 'half',
  half: 'quarter',
  quarter: 'eighth',
  eighth: 'sixteenth',
  sixteenth: 'thirtySecond',
};

export const DEFAULT_TUPLET_NORMAL_NOTES = 2;
export const SUPPORTED_TUPLET_ACTUAL_NOTES = [3] as const;

export type SupportedTupletActualNotes =
  (typeof SUPPORTED_TUPLET_ACTUAL_NOTES)[number];

export function getTupletSlotDuration(
  totalDuration: DurationValue,
  actualNotes: SupportedTupletActualNotes,
  normalNotes = DEFAULT_TUPLET_NORMAL_NOTES,
) {
  if (actualNotes !== 3 || normalNotes !== 2) {
    return null;
  }

  return NEXT_SHORTER_DURATION[totalDuration] ?? null;
}

export function getTupletSlotEffectiveBeats(
  slotDuration: DurationValue,
  actualNotes: SupportedTupletActualNotes,
  normalNotes = DEFAULT_TUPLET_NORMAL_NOTES,
) {
  return getDurationBeats(slotDuration) * (normalNotes / actualNotes);
}

export function createTupletInfo({
  actualNotes,
  id,
  index,
  normalNotes = DEFAULT_TUPLET_NORMAL_NOTES,
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
