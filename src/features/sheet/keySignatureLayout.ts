import type {
  Clef,
  KeySignatureAccidental,
  KeySignatureSymbol,
  Pitch,
  Score,
  Staff,
} from '../../domain/score/types';
import { getActiveKeySignatureSymbolState } from '../../domain/score/keySignatures';
import { getActiveClef } from '../../domain/score/clefChanges';
import {
  getLocalMeasureIndex,
  getMeasureX,
  getScoreStaffTop,
  STAFF_LINE_SPACING,
} from './layout';
import { getPitchYForScore } from './notationGeometry';

const SYMBOL_SPACING = 11.5;
const SYSTEM_START_X_OFFSET = 47;
const MID_MEASURE_X_OFFSET = 14;

const DISPLAY_PITCH_BY_CLEF_AND_ACCIDENTAL = {
  treble: {
    sharp: {
      F: { step: 'F', octave: 5 },
      C: { step: 'C', octave: 5 },
      G: { step: 'G', octave: 5 },
      D: { step: 'D', octave: 5 },
      A: { step: 'A', octave: 4 },
      E: { step: 'E', octave: 5 },
      B: { step: 'B', octave: 4 },
    },
    flat: {
      B: { step: 'B', octave: 4 },
      E: { step: 'E', octave: 5 },
      A: { step: 'A', octave: 4 },
      D: { step: 'D', octave: 5 },
      G: { step: 'G', octave: 4 },
      C: { step: 'C', octave: 5 },
      F: { step: 'F', octave: 4 },
    },
  },
  bass: {
    sharp: {
      F: { step: 'F', octave: 3 },
      C: { step: 'C', octave: 3 },
      G: { step: 'G', octave: 3 },
      D: { step: 'D', octave: 3 },
      A: { step: 'A', octave: 2 },
      E: { step: 'E', octave: 3 },
      B: { step: 'B', octave: 2 },
    },
    flat: {
      B: { step: 'B', octave: 2 },
      E: { step: 'E', octave: 3 },
      A: { step: 'A', octave: 2 },
      D: { step: 'D', octave: 3 },
      G: { step: 'G', octave: 2 },
      C: { step: 'C', octave: 3 },
      F: { step: 'F', octave: 2 },
    },
  },
} satisfies Record<
  Clef,
  Record<KeySignatureAccidental, Record<KeySignatureSymbol['step'], Pitch>>
>;

export interface KeySignatureSymbolLayout {
  accidental: KeySignatureAccidental;
  id: string;
  measureIndex: number;
  pitch: Pitch;
  sourceMeasureIndex: number;
  staffId: Staff['id'];
  staffIndex: number;
  symbolIndex: number;
  x: number;
  y: number;
}

export function getKeySignatureDisplayPitch(
  symbol: KeySignatureSymbol,
  clef: Clef,
) {
  return DISPLAY_PITCH_BY_CLEF_AND_ACCIDENTAL[clef][symbol.accidental][symbol.step];
}

export function getKeySignatureSymbolLayouts(score: Score) {
  const staves = score.parts[0]?.staves ?? [];
  const measureCount = staves[0]?.measures.length ?? 0;
  const layouts: KeySignatureSymbolLayout[] = [];

  staves.forEach((staff, staffIndex) => {
    staff.measures.forEach((measure) => {
      const { sourceMeasureIndex, symbols } = getActiveKeySignatureSymbolState(
        score,
        measure.index,
      );
      const shouldRender =
        symbols.length > 0 &&
        (getLocalMeasureIndex(measure.index, score) === 0 ||
          measure.index === sourceMeasureIndex);

      if (!shouldRender || measure.index >= measureCount) {
        return;
      }

      const xStart =
        getMeasureX(measure.index, score) +
        (getLocalMeasureIndex(measure.index, score) === 0
          ? SYSTEM_START_X_OFFSET
          : MID_MEASURE_X_OFFSET);
      const staffTop = getScoreStaffTop(score, staffIndex, measure.index);

      symbols.forEach((symbol, symbolIndex) => {
        const activeClef = getActiveClef(score, staff.id, measure.index, 0);
        const pitch = getKeySignatureDisplayPitch(symbol, activeClef);

        layouts.push({
          accidental: symbol.accidental,
          id: `${staff.id}-m${measure.index}-${symbol.id}-${symbolIndex}`,
          measureIndex: measure.index,
          pitch,
          sourceMeasureIndex,
          staffId: staff.id,
          staffIndex,
          symbolIndex,
          x: xStart + symbolIndex * SYMBOL_SPACING,
          y:
            getPitchYForScore(
              pitch,
              activeClef,
              staffIndex,
              score,
              measure.index,
            ) || staffTop + STAFF_LINE_SPACING * 2,
        });
      });
    });
  });

  return layouts;
}
