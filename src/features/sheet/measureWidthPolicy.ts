import type { Score } from '../../domain/score/types';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  MIN_FIRST_MEASURE_READABLE_WIDTH,
  MIN_MEASURE_READABLE_WIDTH,
  MIN_READABLE_EXTRA_SLOT_WIDTH,
} from './layoutConstants';
import { getMeasureReadableSlotWeight } from './measureDensity';

export function getMeasureReadableMinWidthForLocalIndex(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
) {
  const baseMinWidth =
    localMeasureIndex === 0
      ? MIN_FIRST_MEASURE_READABLE_WIDTH
      : MIN_MEASURE_READABLE_WIDTH;
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const extraSlots = Math.max(
    0,
    getMeasureReadableSlotWeight(score, measureIndex) - beatsPerMeasure,
  );

  return baseMinWidth + extraSlots * MIN_READABLE_EXTRA_SLOT_WIDTH;
}
