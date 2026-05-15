import type { Score } from '../../domain/score/types';
import { getKeySignatureAccidentalCount } from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  MIN_FIRST_MEASURE_READABLE_WIDTH,
  MIN_MEASURE_READABLE_WIDTH,
  MIN_READABLE_EXTRA_SLOT_WIDTH,
} from './layoutConstants';
import {
  getMeasureReadableInkWidthBonus,
  getMeasureReadableSlotWeight,
} from './measureDensity';

const KEY_SIGNATURE_SYMBOL_READABLE_WIDTH = 12;
const FIRST_SYSTEM_TIME_SIGNATURE_READABLE_WIDTH = 20;

function getMeasureStaffSymbolWidthBonus(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
) {
  const maxKeySignatureSymbols = Math.max(
    0,
    ...score.parts.flatMap((part) =>
      part.staves.flatMap((staff) => {
        const measure = staff.measures.find(
          (candidate) => candidate.index === measureIndex,
        );

        return Math.max(
          measure?.keySignatureSymbols?.length ?? 0,
          measure?.keySignature
            ? Math.abs(getKeySignatureAccidentalCount(measure.keySignature))
            : 0,
        );
      }),
    ),
  );
  const keySignatureBonus =
    maxKeySignatureSymbols * KEY_SIGNATURE_SYMBOL_READABLE_WIDTH;
  const timeSignatureBonus =
    measureIndex === 0 && localMeasureIndex === 0
      ? FIRST_SYSTEM_TIME_SIGNATURE_READABLE_WIDTH
      : 0;

  return keySignatureBonus + timeSignatureBonus;
}

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

  return (
    baseMinWidth +
    extraSlots * MIN_READABLE_EXTRA_SLOT_WIDTH +
    getMeasureReadableInkWidthBonus(score, measureIndex) +
    getMeasureStaffSymbolWidthBonus(score, measureIndex, localMeasureIndex)
  );
}
