import { describe, expect, it } from 'vitest';

import {
  canTransitionPracticeSession,
  getPracticeSessionStatusLabel,
} from './practiceSession';

describe('practiceSession', () => {
  it('keeps practice flow transitions explicit', () => {
    expect(canTransitionPracticeSession('idle', 'countin')).toBe(true);
    expect(canTransitionPracticeSession('countin', 'running')).toBe(true);
    expect(canTransitionPracticeSession('running', 'review')).toBe(true);
    expect(canTransitionPracticeSession('review', 'paused')).toBe(false);
  });

  it('returns compact labels for the UI status chip', () => {
    expect(getPracticeSessionStatusLabel('idle')).toBe('Idle');
    expect(getPracticeSessionStatusLabel('countin')).toBe('Count-in');
    expect(getPracticeSessionStatusLabel('running')).toBe('Running');
  });
});
