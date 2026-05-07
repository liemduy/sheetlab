import type {
  Clef,
  CreateScoreOptions,
  Measure,
  PageSize,
  Score,
  ScorePart,
  ScoreType,
  Staff,
  StaffId,
  TimeSignature,
} from './types';
import { assertScore } from './validation';

const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beats: 4,
  beatUnit: 4,
};

const DEFAULT_TEMPO = 96;
const DEFAULT_PAGE_SIZE: PageSize = 'a4';

function createVoiceId(staffId: StaffId, measureIndex: number) {
  return `voice-${staffId}-${measureIndex + 1}-main`;
}

function createMeasure(staffId: StaffId, index: number): Measure {
  return {
    id: `measure-${staffId}-${index + 1}`,
    index,
    voices: [
      {
        id: createVoiceId(staffId, index),
        events: [],
      },
    ],
  };
}

function createStaff(
  staffId: StaffId,
  clef: Clef,
  measureCount: number,
): Staff {
  return {
    id: staffId,
    clef,
    measures: Array.from({ length: measureCount }, (_, index) =>
      createMeasure(staffId, index),
    ),
  };
}

function createPart(scoreType: ScoreType, measureCount: number): ScorePart {
  const staves: Staff[] =
    scoreType === 'grand'
      ? [
          createStaff('treble', 'treble', measureCount),
          createStaff('bass', 'bass', measureCount),
        ]
      : [createStaff('treble', 'treble', measureCount)];

  return {
    id: 'part-piano',
    name: scoreType === 'grand' ? 'Piano' : 'Melody',
    staves,
  };
}

export function createEmptyScore(
  scoreType: ScoreType,
  options: CreateScoreOptions = {},
): Score {
  const measureCount = options.measureCount ?? 16;

  return {
    id: options.id ?? `score-${scoreType}-v0-1`,
    title: options.title ?? 'Untitled Piano Exercise',
    composer: options.composer ?? '',
    type: scoreType,
    pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    tempo: options.tempo ?? DEFAULT_TEMPO,
    timeSignature: options.timeSignature ?? DEFAULT_TIME_SIGNATURE,
    parts: [createPart(scoreType, measureCount)],
  };
}

export function serializeScore(score: Score): string {
  return JSON.stringify(score, null, 2);
}

export function deserializeScore(serializedScore: string): Score {
  const parsedScore = JSON.parse(serializedScore) as unknown;
  const scoreWithDefaults =
    typeof parsedScore === 'object' &&
    parsedScore !== null &&
    !Array.isArray(parsedScore) &&
    !('pageSize' in parsedScore)
      ? { ...parsedScore, pageSize: DEFAULT_PAGE_SIZE }
      : parsedScore;

  assertScore(scoreWithDefaults);

  return scoreWithDefaults;
}
