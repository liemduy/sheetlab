import { describe, expect, it } from 'vitest';
import type { PracticeTarget } from './practiceTimeline';
import {
  evaluatePracticeHolds,
  getPracticeHoldScorePercent,
} from './practiceHold';

function target(overrides: Partial<PracticeTarget> = {}): PracticeTarget {
  return {
    attackMidiNotes: [60],
    beat: 0,
    durationSeconds: 1,
    eventIds: ['note-1'],
    expectedReleaseSeconds: 1,
    id: 'target-1',
    measureIndex: 0,
    midiNotes: [60],
    pitches: [{ octave: 4, step: 'C' }],
    sourceTimelineEventIds: ['note-1'],
    staffId: 'treble',
    staffIds: ['treble'],
    startBeat: 0,
    startSeconds: 0,
    sustainedMidiNotes: [60],
    voiceRefs: [{ staffId: 'treble', voiceIndex: 0 }],
    ...overrides,
  };
}

describe('practiceHold', () => {
  it('scores a note held near its written duration', () => {
    const results = evaluatePracticeHolds(
      [target()],
      [{ endSeconds: 1.08, midiNote: 60, startSeconds: 0.02 }],
    );

    expect(results.get('target-1')).toMatchObject({ status: 'held' });
    expect(getPracticeHoldScorePercent(results)).toBe(100);
  });

  it('reports notes released too early or held too long', () => {
    const earlyResults = evaluatePracticeHolds(
      [target()],
      [{ endSeconds: 0.6, midiNote: 60, startSeconds: 0 }],
    );
    const overheldResults = evaluatePracticeHolds(
      [target()],
      [{ endSeconds: 1.5, midiNote: 60, startSeconds: 0 }],
    );

    expect(earlyResults.get('target-1')).toMatchObject({
      earlyReleaseMs: 400,
      status: 'released-early',
    });
    expect(overheldResults.get('target-1')).toMatchObject({
      overheldMs: 500,
      status: 'overheld',
    });
  });

  it('skips grace targets and very short targets', () => {
    const results = evaluatePracticeHolds(
      [target({ durationSeconds: 0.08, isGrace: true })],
      [{ endSeconds: 0.01, midiNote: 60, startSeconds: 0 }],
    );

    expect(results.size).toBe(0);
    expect(getPracticeHoldScorePercent(results)).toBeNull();
  });
});
