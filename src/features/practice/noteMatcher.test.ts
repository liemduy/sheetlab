import { describe, expect, it } from 'vitest';
import {
  createMissedPracticeResult,
  evaluatePracticeTarget,
  formatMidiNoteList,
  getPracticeAccuracyPercent,
  getPracticeResultMessage,
  getPracticeResultSummary,
} from './noteMatcher';
import type { PracticeTarget } from './practiceTimeline';

const target = {
  beat: 0,
  durationSeconds: 0.5,
  eventIds: ['c-major'],
  id: 'target-1',
  measureIndex: 0,
  midiNotes: [60, 64, 67],
  pitches: [],
  staffId: 'treble',
  staffIds: ['treble'],
  startBeat: 0,
  startSeconds: 1,
  voiceRefs: [{ staffId: 'treble', voiceIndex: 0 }],
} satisfies PracticeTarget;

describe('note matcher', () => {
  it('marks a chord as correct when all expected notes are present', () => {
    expect(evaluatePracticeTarget(target, [67, 60, 64], { elapsedSeconds: 1 })).toMatchObject({
      extraNotes: [],
      missingNotes: [],
      status: 'correct',
    });
  });

  it('reports partial and wrong matches', () => {
    expect(evaluatePracticeTarget(target, [60, 64])).toMatchObject({
      missingNotes: [67],
      status: 'partial',
    });
    expect(evaluatePracticeTarget(target, [60, 61, 64, 67])).toMatchObject({
      extraNotes: [61],
      status: 'wrong',
    });
  });

  it('reports timing drift', () => {
    expect(
      evaluatePracticeTarget(target, [60, 64, 67], {
        elapsedSeconds: 1.25,
        timingToleranceMs: 120,
      }),
    ).toMatchObject({
      lateMs: 250,
      status: 'wrong',
    });
  });

  it('creates missed result summaries', () => {
    const results = new Map([
      ['a', evaluatePracticeTarget(target, [60, 64, 67])],
      ['b', createMissedPracticeResult({ ...target, id: 'target-2' })],
    ]);

    expect(getPracticeResultSummary(results)).toEqual({
      correct: 1,
      missed: 1,
      partial: 0,
      total: 2,
      wrong: 0,
    });
    expect(formatMidiNoteList([60, 64, 67])).toBe('C4 E4 G4');
  });

  it('summarizes accuracy and actionable result messages', () => {
    const partialResult = evaluatePracticeTarget(target, [60, 64]);
    const results = new Map([
      ['a', evaluatePracticeTarget(target, [60, 64, 67])],
      ['b', partialResult],
    ]);

    expect(getPracticeAccuracyPercent(results, 3)).toBe(50);
    expect(getPracticeResultMessage(partialResult)).toBe('partial: missing G4');
  });
});
