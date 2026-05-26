import { describe, expect, it } from 'vitest';

import type { PracticeTarget } from './practiceTimeline';
import {
  findPracticeTargetInDynamicWindow,
  getPracticeTimingToleranceMs,
} from './practiceTiming';

function target(id: string, startSeconds: number): PracticeTarget {
  return {
    beat: 1,
    durationSeconds: 0.1,
    eventIds: [id],
    id,
    measureIndex: 0,
    midiNotes: [60],
    pitches: [{ octave: 4, step: 'C' }],
    staffId: 'treble',
    staffIds: ['treble'],
    startBeat: 1,
    startSeconds,
    voiceRefs: [{ staffId: 'treble', voiceIndex: 0 }],
  };
}

describe('practiceTiming', () => {
  it('shrinks the rhythm hit window when notes are close together', () => {
    const targets = [target('a', 0), target('b', 0.1)];

    expect(getPracticeTimingToleranceMs('normal', targets[0], targets)).toBe(45);
  });

  it('keeps the base tolerance for wider note gaps', () => {
    const targets = [target('a', 0), target('b', 1)];

    expect(getPracticeTimingToleranceMs('normal', targets[0], targets)).toBe(180);
  });

  it('picks the closest target inside its dynamic window', () => {
    const targets = [target('a', 0), target('b', 0.1), target('c', 0.5)];

    expect(findPracticeTargetInDynamicWindow(targets, 0.12, 'normal')?.id).toBe('b');
    expect(findPracticeTargetInDynamicWindow(targets, 0.21, 'strict')).toBeUndefined();
  });
});
