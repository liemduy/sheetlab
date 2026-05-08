import type {
  KeySignature,
  KeySignatureSymbol,
  Measure,
  Pitch,
  RepeatJumpKind,
  Score,
} from './types';
import {
  createKeySignatureSymbols,
  getKeySignatureSymbolMoveIssue,
  inferKeySignatureFromSymbols,
} from './keySignatures';

export interface MoveKeySignatureSymbolResult {
  moved: boolean;
  reason?: 'duplicate-step' | 'missing-target';
  score: Score;
}

export function setMeasureKeySignature(
  score: Score,
  measureIndex: number,
  keySignature: KeySignature,
): Score {
  const keySignatureSymbols = createKeySignatureSymbols(keySignature);

  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) =>
          measure.index === measureIndex
            ? {
                ...measure,
                keySignature,
                keySignatureSymbols,
              }
            : measure,
        ),
      })),
    })),
  };
}

function getMeasureKeySignatureSymbols(
  measure: Measure,
  fallbackKeySignature: KeySignature,
) {
  return measure.keySignatureSymbols !== undefined
    ? measure.keySignatureSymbols
    : createKeySignatureSymbols(measure.keySignature ?? fallbackKeySignature);
}

export function tryMoveKeySignatureSymbol(
  score: Score,
  sourceMeasureIndex: number,
  symbolIndex: number,
  pitch: Pitch,
): MoveKeySignatureSymbolResult {
  const sourceMeasure = score.parts[0]?.staves[0]?.measures.find(
    (measure) => measure.index === sourceMeasureIndex,
  );

  if (!sourceMeasure) {
    return {
      moved: false,
      reason: 'missing-target',
      score,
    };
  }

  const moveIssue = getKeySignatureSymbolMoveIssue(
    score,
    sourceMeasureIndex,
    symbolIndex,
    pitch,
  );

  if (moveIssue) {
    return {
      moved: false,
      reason: moveIssue,
      score,
    };
  }

  const fallbackKeySignature = sourceMeasure.keySignature ?? 'C';
  const currentSymbols = getMeasureKeySignatureSymbols(
    sourceMeasure,
    fallbackKeySignature,
  );

  const nextSymbols = currentSymbols.map((symbol, index) =>
    index === symbolIndex
      ? {
          ...symbol,
          step: pitch.step,
        }
      : symbol,
  ) satisfies KeySignatureSymbol[];
  const inferredKeySignature = inferKeySignatureFromSymbols(nextSymbols);
  const nextKeySignature = inferredKeySignature ?? fallbackKeySignature;

  return {
    moved: true,
    score: {
      ...score,
      parts: score.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) => ({
          ...staff,
          measures: staff.measures.map((measure) =>
            measure.index === sourceMeasureIndex
              ? {
                  ...measure,
                  keySignature: nextKeySignature,
                  keySignatureSymbols: nextSymbols,
                }
              : measure,
          ),
        })),
      })),
    },
  };
}

export function setMeasureRepeatJump(
  score: Score,
  measureIndex: number,
  repeatJump: RepeatJumpKind | null,
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) =>
          measure.index === measureIndex
            ? {
                ...measure,
                repeatJump: repeatJump ?? undefined,
              }
            : measure,
        ),
      })),
    })),
  };
}

export function setScoreTimeSignature(
  score: Score,
  timeSignature: Score['timeSignature'],
): Score {
  return {
    ...score,
    timeSignature,
  };
}
