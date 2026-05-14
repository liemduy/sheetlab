import { describe, expect, it } from 'vitest';
import {
  extremeScoreFixtures,
  trebleStudyFixture,
} from './fixtures';
import { getScoreMusicIssues } from './musicIssues';
import type { RangeNotationMark, Score } from './types';

function cloneScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score)) as Score;
}

function firstTrebleVoice(score: Score) {
  return score.parts[0]!.staves.find((staff) => staff.id === 'treble')!
    .measures[0]!.voices[0]!;
}

describe('score music issues', () => {
  it.each(extremeScoreFixtures)(
    'accepts valid extreme fixture %s',
    (score) => {
      expect(getScoreMusicIssues(score)).toEqual([]);
    },
  );

  it('reports missing repeat anchors', () => {
    const score = cloneScore(trebleStudyFixture);

    score.parts[0]!.staves[0]!.measures[1]!.repeatJump = 'dc-al-fine';

    expect(getScoreMusicIssues(score)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'repeat',
          kind: 'missing-fine',
          measureIndex: 1,
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports invalid lyric map targets', () => {
    const score = cloneScore(trebleStudyFixture);
    const firstEvent = firstTrebleVoice(score).events[0]!;

    firstEvent.lyric = 'la';
    firstEvent.lyricMap = {
      eventIds: [firstEvent.id, 'missing-note'],
    };

    expect(getScoreMusicIssues(score)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'lyric-map',
          kind: 'lyric-map-target-missing',
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports invalid ottava targets', () => {
    const score = cloneScore(trebleStudyFixture);
    const firstEvent = firstTrebleVoice(score).events[0]!;
    const badOttava: RangeNotationMark = {
      end: {
        beat: 1,
        measureIndex: 0,
        staffId: 'treble',
        voiceIndex: 0,
      },
      id: 'bad-ottava',
      kind: 'ottava',
      ottava: '8va',
      scope: 'range',
      sourceEventId: firstEvent.id,
      start: {
        beat: 0,
        measureIndex: 0,
        staffId: 'treble',
        voiceIndex: 0,
      },
      targetEventId: 'missing-ottava-target',
    };

    score.marks = [badOttava];

    expect(getScoreMusicIssues(score)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'range-mark',
          kind: 'range-target-missing',
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports ties that do not connect adjacent matching pitch', () => {
    const score = cloneScore(trebleStudyFixture);
    const [firstEvent, secondEvent] = firstTrebleVoice(score).events;

    firstEvent!.ties = [
      {
        pitchIndex: 0,
        targetEventId: secondEvent!.id,
        targetPitchIndex: 0,
      },
    ];

    expect(getScoreMusicIssues(score)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'tie',
          kind: 'tie-pitch-mismatch',
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports incomplete tuplet groups', () => {
    const score = cloneScore(trebleStudyFixture);
    const [firstEvent, secondEvent] = firstTrebleVoice(score).events;

    firstEvent!.tuplet = {
      actualNotes: 3,
      id: 'broken-triplet',
      index: 0,
      normalNotes: 2,
    };
    secondEvent!.tuplet = {
      actualNotes: 3,
      id: 'broken-triplet',
      index: 1,
      normalNotes: 2,
    };

    expect(getScoreMusicIssues(score)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'tuplet',
          kind: 'tuplet-incomplete',
          severity: 'error',
        }),
      ]),
    );
  });
});
