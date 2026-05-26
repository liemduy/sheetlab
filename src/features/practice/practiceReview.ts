import {
  getPracticeAccuracyPercent,
  getPracticeResultMessage,
  type PracticeResult,
} from './noteMatcher';
import type {
  PracticePedalResult,
  PracticePedalTarget,
} from './practicePedal';
import type { PracticeTarget } from './practiceTimeline';

export interface PracticeMeasureReview {
  labels: string[];
  measureIndex: number;
  noteIssues: number;
  pedalIssues: number;
  timingIssues: number;
}

export interface PracticeReviewSummary {
  completionPercent: number;
  earlyCount: number;
  issueRows: string[];
  lateCount: number;
  measureSummaries: PracticeMeasureReview[];
  meanTimingBiasMs: number | null;
  medianTimingDeltaMs: number | null;
  noteAccuracyPercent: number;
  pedalScorePercent: number | null;
  resolvedTargets: number;
  rhythmIssueCount: number;
  timingScorePercent: number | null;
  totalTargets: number;
}

function getPedalReviewLabel(result: PracticePedalResult) {
  const action = result.action === 'down' ? 'Pedal down' : 'Pedal up';

  if (result.status === 'correct') {
    return `${action} ok`;
  }

  if (result.status === 'missed') {
    return `${action} missed`;
  }

  return `${action} ${Math.abs(result.deltaMs ?? 0)}ms ${result.status}`;
}

function getMeasureReview(
  measureReviews: Map<number, PracticeMeasureReview>,
  measureIndex: number,
) {
  const currentReview = measureReviews.get(measureIndex);

  if (currentReview) {
    return currentReview;
  }

  const nextReview = {
    labels: [],
    measureIndex,
    noteIssues: 0,
    pedalIssues: 0,
    timingIssues: 0,
  };

  measureReviews.set(measureIndex, nextReview);
  return nextReview;
}

function hasNoteIssue(result: PracticeResult) {
  return (
    result.status === 'missed' ||
    result.status === 'partial' ||
    result.missingNotes.length > 0 ||
    result.extraNotes.length > 0
  );
}

function isTimingIssue(result: PracticeResult, timingToleranceMs: number) {
  return (
    result.timingDeltaMs !== undefined &&
    Math.abs(result.timingDeltaMs) > timingToleranceMs
  );
}

function getMedian(values: readonly number[]) {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((first, second) => first - second);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }

  return Math.round(
    (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2,
  );
}

function addMeasureLabel(
  measureReviews: Map<number, PracticeMeasureReview>,
  measureIndex: number,
  label: string,
  counters: Partial<Pick<
    PracticeMeasureReview,
    'noteIssues' | 'pedalIssues' | 'timingIssues'
  >>,
) {
  const review = getMeasureReview(measureReviews, measureIndex);

  review.labels.push(label);
  review.noteIssues += counters.noteIssues ?? 0;
  review.pedalIssues += counters.pedalIssues ?? 0;
  review.timingIssues += counters.timingIssues ?? 0;
}

export function buildPracticeReviewSummary({
  pedalResults,
  pedalTargets,
  results,
  targets,
  getTimingToleranceMs,
  timingToleranceMs,
}: {
  pedalResults: ReadonlyMap<string, PracticePedalResult>;
  pedalTargets: readonly PracticePedalTarget[];
  results: ReadonlyMap<string, PracticeResult>;
  targets: readonly PracticeTarget[];
  getTimingToleranceMs?: (target: PracticeTarget) => number;
  timingToleranceMs: number;
}): PracticeReviewSummary {
  const pedalTargetById = new Map(
    pedalTargets.map((target) => [target.id, target]),
  );
  const measureReviews = new Map<number, PracticeMeasureReview>();
  let timedResultCount = 0;
  let timingCorrectCount = 0;
  let rhythmIssueCount = 0;
  let earlyCount = 0;
  let lateCount = 0;
  const timingDeltas: number[] = [];

  targets.forEach((target) => {
    const result = results.get(target.id);

    if (!result) {
      addMeasureLabel(
        measureReviews,
        target.measureIndex,
        `M${target.measureIndex + 1}: pending note target`,
        { noteIssues: 1 },
      );
      return;
    }

    const noteIssue = hasNoteIssue(result);
    const targetTimingToleranceMs =
      getTimingToleranceMs?.(target) ?? timingToleranceMs;
    const timingIssue = isTimingIssue(result, targetTimingToleranceMs);

    if (result.timingDeltaMs !== undefined) {
      timingDeltas.push(result.timingDeltaMs);
      timedResultCount += 1;
      timingCorrectCount += timingIssue ? 0 : 1;
      if (result.timingDeltaMs < -targetTimingToleranceMs) {
        earlyCount += 1;
      } else if (result.timingDeltaMs > targetTimingToleranceMs) {
        lateCount += 1;
      }
    }

    if (timingIssue) {
      rhythmIssueCount += 1;
    }

    if (noteIssue || timingIssue || result.status !== 'correct') {
      addMeasureLabel(
        measureReviews,
        target.measureIndex,
        `M${target.measureIndex + 1}: ${getPracticeResultMessage(result)}`,
        {
          noteIssues: noteIssue ? 1 : 0,
          timingIssues: timingIssue ? 1 : 0,
        },
      );
    }
  });

  pedalTargets.forEach((target) => {
    const result = pedalResults.get(target.id);

    if (!result) {
      addMeasureLabel(
        measureReviews,
        target.measureIndex,
        `M${target.measureIndex + 1}: pedal ${target.action} pending`,
        { pedalIssues: 1 },
      );
      return;
    }

    if (result.status !== 'correct') {
      const measureIndex =
        pedalTargetById.get(result.targetId)?.measureIndex ?? target.measureIndex;

      addMeasureLabel(
        measureReviews,
        measureIndex,
        `M${measureIndex + 1}: ${getPedalReviewLabel(result)}`,
        { pedalIssues: 1 },
      );
    }
  });

  const pedalCorrectCount = [...pedalResults.values()].filter(
    (result) => result.status === 'correct',
  ).length;
  const measureSummaries = [...measureReviews.values()].sort(
    (first, second) => first.measureIndex - second.measureIndex,
  );
  const meanTimingBiasMs =
    timingDeltas.length === 0
      ? null
      : Math.round(
          timingDeltas.reduce((sum, deltaMs) => sum + deltaMs, 0) /
            timingDeltas.length,
        );

  return {
    completionPercent:
      targets.length === 0 ? 0 : Math.round((results.size / targets.length) * 100),
    earlyCount,
    issueRows: measureSummaries.flatMap((review) => review.labels),
    lateCount,
    measureSummaries,
    meanTimingBiasMs,
    medianTimingDeltaMs: getMedian(timingDeltas),
    noteAccuracyPercent: getPracticeAccuracyPercent(results, targets.length),
    pedalScorePercent:
      pedalTargets.length === 0
        ? null
        : Math.round((pedalCorrectCount / pedalTargets.length) * 100),
    resolvedTargets: results.size,
    rhythmIssueCount,
    timingScorePercent:
      timedResultCount === 0 || targets.length === 0
        ? null
        : Math.round((timingCorrectCount / targets.length) * 100),
    totalTargets: targets.length,
  };
}
