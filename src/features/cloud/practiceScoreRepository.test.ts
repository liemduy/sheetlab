import { describe, expect, it } from 'vitest';
import { getPracticeScorePercent } from './practiceScoreRepository';
import type { PracticeReviewSummary } from '../practice/practiceReview';

function createReviewSummary(
  overrides: Partial<PracticeReviewSummary>,
): PracticeReviewSummary {
  return {
    completionPercent: 100,
    earlyCount: 0,
    issueRows: [],
    lateCount: 0,
    meanTimingBiasMs: null,
    measureSummaries: [],
    medianTimingDeltaMs: null,
    noteAccuracyPercent: 0,
    pedalScorePercent: null,
    resolvedTargets: 0,
    rhythmIssueCount: 0,
    timingScorePercent: null,
    totalTargets: 0,
    ...overrides,
  };
}

describe('practice score repository helpers', () => {
  it('averages available note, timing, and pedal scores', () => {
    expect(
      getPracticeScorePercent(
        createReviewSummary({
          noteAccuracyPercent: 90,
          pedalScorePercent: 60,
          timingScorePercent: 75,
        }),
      ),
    ).toBe(75);
  });

  it('falls back to note accuracy when expression scores are unavailable', () => {
    expect(
      getPracticeScorePercent(
        createReviewSummary({
          noteAccuracyPercent: 88,
          pedalScorePercent: null,
          timingScorePercent: null,
        }),
      ),
    ).toBe(88);
  });
});
