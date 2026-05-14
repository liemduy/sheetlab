import { Barline, Repetition, Stave, Volta } from 'vexflow';
import type { Score } from '../../domain/score/types';
import { getMeasureRepeatJump } from '../../domain/score/repeatJumps';

const REPETITION_TYPE_BY_REPEAT_JUMP = {
  coda: Repetition.type.CODA_LEFT,
  dc: Repetition.type.DC,
  'dc-al-coda': Repetition.type.DC_AL_CODA,
  'dc-al-fine': Repetition.type.DC_AL_FINE,
  ds: Repetition.type.DS,
  'ds-al-coda': Repetition.type.DS_AL_CODA,
  'ds-al-fine': Repetition.type.DS_AL_FINE,
  fine: Repetition.type.FINE,
  segno: Repetition.type.SEGNO_LEFT,
  'to-coda': Repetition.type.TO_CODA,
} as const;

export function applyRepeatJumpToStave(
  stave: Stave,
  score: Score,
  measureIndex: number,
  staffIndex: number,
) {
  const repeatJump = getMeasureRepeatJump(score, measureIndex);

  if (!repeatJump) {
    return;
  }

  if (repeatJump === 'repeat-start') {
    stave.setBegBarType(Barline.type.REPEAT_BEGIN);
    return;
  }

  if (repeatJump === 'repeat-end') {
    stave.setEndBarType(Barline.type.REPEAT_END);
    return;
  }

  if (repeatJump === 'repeat-both') {
    stave.setBegBarType(Barline.type.REPEAT_BEGIN);
    stave.setEndBarType(Barline.type.REPEAT_END);
    return;
  }

  if (staffIndex !== 0) {
    return;
  }

  if (
    repeatJump === 'ending-1' ||
    repeatJump === 'ending-2' ||
    repeatJump === 'ending-3'
  ) {
    stave.setVoltaType(
      Volta.type.BEGIN_END,
      `${repeatJump.replace('ending-', '')}.`,
      -20,
    );
    return;
  }

  const repetitionType =
    REPETITION_TYPE_BY_REPEAT_JUMP[
      repeatJump as keyof typeof REPETITION_TYPE_BY_REPEAT_JUMP
    ];

  if (repetitionType !== undefined) {
    stave.setRepetitionType(repetitionType, -8);
  }
}
