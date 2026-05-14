import type { Measure, RepeatJumpKind, Score } from './types';

export interface RepeatJumpOption {
  description: string;
  kind: RepeatJumpKind;
  label: string;
  symbol: string;
}

export interface RepeatPlaybackIssue {
  kind:
    | 'missing-coda'
    | 'missing-fine'
    | 'missing-segno'
    | 'missing-to-coda';
  measureIndex: number;
  repeatJump: RepeatJumpKind;
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

function getRepeatJumpMeasureIndexes(score: Score, kind: RepeatJumpKind) {
  return (
    score.parts[0]?.staves[0]?.measures
      .filter((measure) => measure.repeatJump === kind)
      .map((measure) => measure.index) ?? []
  );
}

function hasRepeatJump(score: Score, kind: RepeatJumpKind) {
  return getRepeatJumpMeasureIndexes(score, kind).length > 0;
}

function getMarkedMeasures(score: Score) {
  return score.parts[0]?.staves[0]?.measures.filter(
    (measure): measure is Measure & { repeatJump: RepeatJumpKind } =>
      Boolean(measure.repeatJump),
  ) ?? [];
}

export function getRepeatPlaybackIssues(score: Score): RepeatPlaybackIssue[] {
  const issues: RepeatPlaybackIssue[] = [];
  const hasFine = hasRepeatJump(score, 'fine');
  const hasSegno = hasRepeatJump(score, 'segno');
  const hasToCoda = hasRepeatJump(score, 'to-coda');
  const hasCoda = hasRepeatJump(score, 'coda');

  getMarkedMeasures(score).forEach((measure) => {
    const repeatJump = measure.repeatJump;

    if (
      (repeatJump === 'ds' ||
        repeatJump === 'ds-al-fine' ||
        repeatJump === 'ds-al-coda') &&
      !hasSegno
    ) {
      issues.push({
        kind: 'missing-segno',
        measureIndex: measure.index,
        repeatJump,
      });
    }

    if (
      (repeatJump === 'dc-al-fine' || repeatJump === 'ds-al-fine') &&
      !hasFine
    ) {
      issues.push({
        kind: 'missing-fine',
        measureIndex: measure.index,
        repeatJump,
      });
    }

    if (
      (repeatJump === 'dc-al-coda' || repeatJump === 'ds-al-coda') &&
      !hasToCoda
    ) {
      issues.push({
        kind: 'missing-to-coda',
        measureIndex: measure.index,
        repeatJump,
      });
    }

    if (
      (repeatJump === 'dc-al-coda' || repeatJump === 'ds-al-coda') &&
      !hasCoda
    ) {
      issues.push({
        kind: 'missing-coda',
        measureIndex: measure.index,
        repeatJump,
      });
    }
  });

  return issues;
}
