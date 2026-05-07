import type { Clef, Pitch } from '../../domain/score/types';
import {
  TOP_LINE_BY_CLEF,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import {
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getStaffTop,
} from './layout';

export function getPitchY(
  pitch: Pitch,
  clef: Clef,
  staffIndex: number,
  staffGap = STAFF_GAP,
) {
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const pitchValue = pitchToDiatonicValue(pitch);
  const diatonicOffset = pitchValue - topLineValue;

  return getStaffTop(staffIndex, staffGap) - diatonicOffset * (STAFF_LINE_SPACING / 2);
}

export function getBeatX(
  measureIndex: number,
  beat: number,
  beatsPerMeasure: number,
) {
  return (
    getMeasureContentLeft(measureIndex) +
    (beat / beatsPerMeasure) * getMeasureContentWidth(measureIndex)
  );
}
