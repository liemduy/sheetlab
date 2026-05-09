import type { Clef, Pitch, Score } from '../../domain/score/types';
import {
  TOP_LINE_BY_CLEF,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import {
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getScoreStaffTop,
  getStaffTop,
} from './layout';

export function getPitchY(
  pitch: Pitch,
  clef: Clef,
  staffIndex: number,
  staffGap = STAFF_GAP,
  measureIndex = 0,
  systemGap = staffGap + 152,
) {
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const pitchValue = pitchToDiatonicValue(pitch);
  const diatonicOffset = pitchValue - topLineValue;

  return getStaffTop(staffIndex, staffGap, measureIndex, systemGap) -
    diatonicOffset * (STAFF_LINE_SPACING / 2);
}

export function getPitchYForScore(
  pitch: Pitch,
  clef: Clef,
  staffIndex: number,
  score: Score,
  measureIndex = 0,
) {
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const pitchValue = pitchToDiatonicValue(pitch);
  const diatonicOffset = pitchValue - topLineValue;

  return getScoreStaffTop(score, staffIndex, measureIndex) -
    diatonicOffset * (STAFF_LINE_SPACING / 2);
}

export function getBeatX(
  measureIndex: number,
  beat: number,
  beatsPerMeasure: number,
  score?: Score,
) {
  return (
    getMeasureContentLeft(measureIndex, score) +
    (beat / beatsPerMeasure) * getMeasureContentWidth(measureIndex, score)
  );
}
