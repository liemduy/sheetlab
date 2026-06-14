import { describe, expect, it } from 'vitest';
import type { PracticeTarget } from './practiceTimeline';
import { findSequentialPracticeTarget } from './practiceMatcher';

function target(id: string, startSeconds: number): PracticeTarget {
  return {
    attackMidiNotes: [60],
    beat: startSeconds * 2,
    durationSeconds: 0.2,
    eventIds: [id],
    expectedReleaseSeconds: startSeconds + 0.2,
    id,
    measureIndex: 0,
    midiNotes: [60],
    pitches: [{ octave: 4, step: 'C' }],
    sourceTimelineEventIds: [id],
    staffId: 'treble',
    staffIds: ['treble'],
    startBeat: startSeconds * 2,
    startSeconds,
    sustainedMidiNotes: [60],
    voiceRefs: [{ staffId: 'treble', voiceIndex: 0 }],
  };
}

describe('practiceMatcher', () => {
  it('keeps a late repeated note on the current target until the next attack starts', () => {
    const targets = [target('repeat-1', 0), target('repeat-2', 0.2)];
    const match = findSequentialPracticeTarget({
      currentTargetIndex: 0,
      elapsedSeconds: 0.14,
      resolvedTargetIds: new Set(),
      targets,
      timingLevel: 'normal',
    });

    expect(match).toMatchObject({
      reason: 'late-current',
      target: { id: 'repeat-1' },
    });
  });

  it('allows the next target once the current target window has passed', () => {
    const targets = [target('repeat-1', 0), target('repeat-2', 0.2)];
    const match = findSequentialPracticeTarget({
      currentTargetIndex: 0,
      elapsedSeconds: 0.2,
      resolvedTargetIds: new Set(['repeat-1']),
      targets,
      timingLevel: 'normal',
    });

    expect(match).toMatchObject({
      reason: 'nearby',
      target: { id: 'repeat-2' },
    });
  });
});
