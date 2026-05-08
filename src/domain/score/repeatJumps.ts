import type { Measure, RepeatJumpKind, Score } from './types';

export interface RepeatJumpOption {
  description: string;
  kind: RepeatJumpKind;
  label: string;
  symbol: string;
}

export const REPEAT_JUMP_OPTIONS = [
  {
    description: 'Start repeat barline at this measure',
    kind: 'repeat-start',
    label: 'Repeat start',
    symbol: '𝄆',
  },
  {
    description: 'End repeat barline at this measure',
    kind: 'repeat-end',
    label: 'Repeat end',
    symbol: '𝄇',
  },
  {
    description: 'Begin and end repeat barline at this measure',
    kind: 'repeat-both',
    label: 'Repeat both',
    symbol: '𝄇𝄆',
  },
  {
    description: 'First ending volta bracket',
    kind: 'ending-1',
    label: '1st ending',
    symbol: '1.',
  },
  {
    description: 'Second ending volta bracket',
    kind: 'ending-2',
    label: '2nd ending',
    symbol: '2.',
  },
  {
    description: 'Third ending volta bracket',
    kind: 'ending-3',
    label: '3rd ending',
    symbol: '3.',
  },
  {
    description: 'Segno sign',
    kind: 'segno',
    label: 'Segno',
    symbol: '𝄋',
  },
  {
    description: 'Coda sign',
    kind: 'coda',
    label: 'Coda',
    symbol: '𝄌',
  },
  {
    description: 'Fine marker',
    kind: 'fine',
    label: 'Fine',
    symbol: 'Fine',
  },
  {
    description: 'To Coda instruction',
    kind: 'to-coda',
    label: 'To Coda',
    symbol: 'To 𝄌',
  },
  {
    description: 'Da Capo',
    kind: 'dc',
    label: 'D.C.',
    symbol: 'D.C.',
  },
  {
    description: 'Da Capo al Fine',
    kind: 'dc-al-fine',
    label: 'D.C. al Fine',
    symbol: 'D.C. al Fine',
  },
  {
    description: 'Da Capo al Coda',
    kind: 'dc-al-coda',
    label: 'D.C. al Coda',
    symbol: 'D.C. al Coda',
  },
  {
    description: 'Dal Segno',
    kind: 'ds',
    label: 'D.S.',
    symbol: 'D.S.',
  },
  {
    description: 'Dal Segno al Fine',
    kind: 'ds-al-fine',
    label: 'D.S. al Fine',
    symbol: 'D.S. al Fine',
  },
  {
    description: 'Dal Segno al Coda',
    kind: 'ds-al-coda',
    label: 'D.S. al Coda',
    symbol: 'D.S. al Coda',
  },
] satisfies readonly RepeatJumpOption[];

export function isRepeatJumpKind(value: unknown): value is RepeatJumpKind {
  return (
    typeof value === 'string' &&
    REPEAT_JUMP_OPTIONS.some((option) => option.kind === value)
  );
}

export function getRepeatJumpOption(kind: RepeatJumpKind) {
  return REPEAT_JUMP_OPTIONS.find((option) => option.kind === kind);
}

function findMeasureAtIndex(score: Score, measureIndex: number): Measure | undefined {
  return score.parts[0]?.staves[0]?.measures.find(
    (measure) => measure.index === measureIndex,
  );
}

export function getMeasureRepeatJump(score: Score, measureIndex: number) {
  return findMeasureAtIndex(score, measureIndex)?.repeatJump ?? null;
}
