import { describe, expect, it } from 'vitest';
import { pianoPracticeLoopFixture } from '../../domain/score/fixtures';
import {
  createMissedPracticeResult,
  evaluatePracticeTarget,
  type PracticeResult,
} from './noteMatcher';
import {
  buildPracticePedalTargets,
  createMissedPedalResult,
  type PracticePedalResult,
} from './practicePedal';
import { buildPracticeTargets } from './practiceTimeline';
import { buildPracticeReviewSummary } from './practiceReview';

describe('buildPracticeReviewSummary', () => {
  it('groups note, timing, and pedal issues by measure', () => {
    const targets = buildPracticeTargets(pianoPracticeLoopFixture).slice(0, 3);
    const pedalTargets = buildPracticePedalTargets(pianoPracticeLoopFixture)
      .slice(0, 1);
    const results = new Map<string, PracticeResult>();
    const pedalResults = new Map<string, PracticePedalResult>();

    results.set(
      targets[0].id,
      evaluatePracticeTarget(targets[0], targets[0].midiNotes, {
        elapsedSeconds: targets[0].startSeconds,
        timingToleranceMs: 180,
      }),
    );
    results.set(
      targets[1].id,
      evaluatePracticeTarget(targets[1], targets[1].midiNotes, {
        elapsedSeconds: targets[1].startSeconds + 0.32,
        timingToleranceMs: 180,
      }),
    );
    results.set(targets[2].id, createMissedPracticeResult(targets[2]));

    if (pedalTargets[0]) {
      pedalResults.set(
        pedalTargets[0].id,
        createMissedPedalResult(pedalTargets[0]),
      );
    }

    const summary = buildPracticeReviewSummary({
      pedalResults,
      pedalTargets,
      results,
      targets,
      timingToleranceMs: 180,
    });

    expect(summary.completionPercent).toBe(100);
    expect(summary.noteAccuracyPercent).toBe(33);
    expect(summary.timingScorePercent).toBe(33);
    expect(summary.rhythmIssueCount).toBe(1);
    expect(summary.measureSummaries[0]?.labels.join(' ')).toContain('M1');
    expect(summary.issueRows.join(' ')).toMatch(/late|Missed|Pedal/);
  });
});
